import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Glean } from '@gleanwork/api-client';
import type { PlatformSkill } from '@gleanwork/api-client/models/components';
import {
  buildBundle,
  readStream,
  verifyDownloadedBundle,
  type SkillBundle,
} from './bundle.js';
import { discoverSkills, type Discovery } from './discover.js';
import { CleanupFailedError, formatError, httpStatus } from './errors.js';
import { openPluginSource, type PluginSource } from './plugin-source.js';

export type SkillsApi = Pick<
  Glean['skills'],
  'create' | 'delete' | 'list' | 'retrieve' | 'retrieveContent' | 'validate'
>;

export type PlanAction = 'create' | 'new-version' | 'unchanged' | 'invalid';

export interface PlannedSkill {
  bundle: SkillBundle;
  action: PlanAction;
  displayName?: string;
  /** Other folders with byte-identical content, uploaded once. */
  duplicates: string[];
  /** Other discovered skills with different content and the same name. */
  conflicts: string[];
  /** Accessible skills that already use this name. */
  existing: PlatformSkill[];
  problem?: string;
  warnings: string[];
}

export interface ImportPlan {
  location: string;
  discovery: Discovery;
  skills: PlannedSkill[];
}

export type Outcome = 'created' | 'new-version' | 'failed' | 'not-attempted';

export interface ImportResult {
  planned: PlannedSkill;
  outcome: Outcome;
  skill?: PlatformSkill;
  error?: string;
}

type Log = (message: string) => void;

// Statuses that mean this bundle was rejected, not that the run is broken.
const BUNDLE_REJECTED = new Set([400, 413, 422]);
// Statuses that will fail every remaining upload the same way.
const RUN_BLOCKED = new Set([401, 403, 404]);

export function label(planned: PlannedSkill) {
  return planned.bundle.skill.dir || '(plugin root)';
}

export async function listSkillsByName(api: SkillsApi) {
  const byName = new Map<string, PlatformSkill[]>();
  let cursor: string | undefined;
  do {
    const page = await api.list(100, cursor);
    for (const skill of page.results) {
      byName.set(skill.display_name, [
        ...(byName.get(skill.display_name) ?? []),
        skill,
      ]);
    }
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return byName;
}

async function matchesPublished(
  api: SkillsApi,
  skillId: string,
  files: Map<string, Uint8Array>,
) {
  let total = 0;
  for (const bytes of files.values()) total += bytes.byteLength;
  try {
    const response = await api.retrieveContent(skillId);
    // A matching archive is never larger than its files plus ZIP overhead.
    const archive = await readStream(response.result, 2 * total + 1024 * 1024);
    await verifyDownloadedBundle(archive, files);
    return true;
  } catch {
    return false;
  }
}

export async function planImport(
  api: SkillsApi,
  source: PluginSource,
  log: Log = () => undefined,
): Promise<ImportPlan> {
  const discovery = await discoverSkills(source);
  log(`Found ${discovery.skills.length} skill folder(s).`);

  const unique = new Map<string, PlannedSkill>();
  const skills: PlannedSkill[] = [];
  for (const skill of discovery.skills) {
    const entry: PlannedSkill = {
      bundle: {
        skill,
        fileName: '',
        content: new Uint8Array(),
        files: new Map(),
        digest: '',
      },
      action: 'create',
      duplicates: [],
      conflicts: [],
      existing: [],
      warnings: [],
    };
    try {
      entry.bundle = await buildBundle(source, skill);
    } catch (error) {
      entry.action = 'invalid';
      entry.problem = formatError(error).error;
      skills.push(entry);
      continue;
    }
    const same = unique.get(entry.bundle.digest);
    if (same) {
      same.duplicates.push(skill.dir || '(plugin root)');
      continue;
    }
    unique.set(entry.bundle.digest, entry);
    skills.push(entry);
  }

  for (const entry of skills) {
    if (entry.action === 'invalid') continue;
    log(`Validating ${label(entry)} without saving it...`);
    try {
      const validation = await api.validate({
        file: {
          fileName: entry.bundle.fileName,
          content: entry.bundle.content,
        },
      });
      entry.displayName = validation.metadata.display_name;
      entry.warnings.push(
        ...validation.warnings.map((warning) => warning.message),
      );
      const normalized = validation.files.map((file) => file.path).sort();
      const local = [...entry.bundle.files.keys()].sort();
      if (normalized.join('\n') !== local.join('\n')) {
        entry.warnings.push(
          `Glean normalized the bundle to: ${normalized.join(', ') || 'no files'}.`,
        );
      }
    } catch (error) {
      if (!BUNDLE_REJECTED.has(httpStatus(error) ?? 0)) throw error;
      entry.action = 'invalid';
      entry.problem = formatError(error).error;
    }
  }

  // Two different bundles with one name would overwrite each other, so they
  // are never imported together.
  const valid = skills.filter((entry) => entry.action !== 'invalid');
  for (const entry of valid) {
    entry.conflicts = valid
      .filter(
        (other) => other !== entry && other.displayName === entry.displayName,
      )
      .map(label);
  }

  if (valid.length > 0) {
    log('Checking which skill names already exist...');
    const existing = await listSkillsByName(api);
    for (const entry of valid) {
      entry.existing = existing.get(entry.displayName ?? '') ?? [];
      if (entry.existing.length > 0) entry.action = 'new-version';
    }
  }

  // Skip a skill whose latest published files already match, so importing
  // again publishes only what changed.
  for (const entry of valid) {
    if (entry.action !== 'new-version') continue;
    for (const existing of entry.existing) {
      if (existing.origin !== 'CUSTOM') continue;
      log(`Comparing ${label(entry)} with ${existing.skill_id}...`);
      if (await matchesPublished(api, existing.skill_id, entry.bundle.files)) {
        entry.action = 'unchanged';
        entry.existing = [existing];
        break;
      }
    }
  }

  return { location: source.location, discovery, skills };
}

export function isImportable(entry: PlannedSkill) {
  return entry.action === 'create' || entry.action === 'new-version';
}

/**
 * The skills to publish: every importable skill without a name conflict, or
 * exactly the selected indexes. A selection may resolve a conflict by picking
 * one of the skills that share a name, but never both.
 */
export function selectSkills(plan: ImportPlan, selection?: number[]) {
  if (selection === undefined) {
    return plan.skills.filter(
      (entry) => isImportable(entry) && entry.conflicts.length === 0,
    );
  }
  const chosen = [...new Set(selection)].map((index) => {
    const entry = plan.skills[index];
    if (!entry || !isImportable(entry)) {
      throw new Error(`Skill ${index} is not ready to publish.`);
    }
    return entry;
  });
  const names = chosen.map((entry) => entry.displayName);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) {
    throw new Error(
      `Choose only one skill named "${repeated}"; they would overwrite each other.`,
    );
  }
  return chosen;
}

export async function applyImport(
  api: SkillsApi,
  skills: PlannedSkill[],
  log: Log = () => undefined,
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  let blocked: string | undefined;
  for (const planned of skills) {
    if (blocked) {
      results.push({ planned, outcome: 'not-attempted', error: blocked });
      continue;
    }
    log(`Publishing ${planned.displayName} from ${label(planned)}...`);
    try {
      // Create supersedes your own same-name skill with a new version. Never
      // retry it: a timed-out request may still have saved the skill.
      const { skill } = await api.create(
        {
          file: {
            fileName: planned.bundle.fileName,
            content: planned.bundle.content,
          },
        },
        { retries: { strategy: 'none' } },
      );
      const isNew =
        skill.latest_version === 1 && skill.latest_minor_version === 1;
      results.push({
        planned,
        outcome: isNew ? 'created' : 'new-version',
        skill,
      });
    } catch (error) {
      const formatted = formatError(error);
      results.push({
        planned,
        outcome: 'failed',
        error: formatted.hint
          ? `${formatted.error} ${formatted.hint}`
          : formatted.error,
      });
      if (RUN_BLOCKED.has(httpStatus(error) ?? 0)) {
        blocked = `Not attempted after: ${formatted.error}`;
      }
    }
  }
  return results;
}

/** A JSON-safe view of a plan for the browser. */
export function planView(plan: ImportPlan) {
  return {
    location: plan.location,
    layout: plan.discovery.layout,
    plugins: plan.discovery.plugins,
    notices: plan.discovery.notices,
    skills: plan.skills.map((entry, index) => ({
      index,
      dir: label(entry),
      plugin: entry.bundle.skill.plugin,
      name: entry.displayName,
      action: entry.action,
      files: entry.bundle.files.size,
      duplicates: entry.duplicates,
      conflicts: entry.conflicts,
      existing: entry.existing.map((skill) => ({
        id: skill.skill_id,
        version: `${skill.latest_version}.${skill.latest_minor_version}`,
        owner: skill.owner.name,
        githubManaged: skill.origin === 'GITHUB',
      })),
      problem: entry.problem,
      warnings: entry.warnings,
      selected: isImportable(entry) && entry.conflicts.length === 0,
    })),
  };
}

export function resultView(results: ImportResult[]) {
  const count = (outcome: Outcome) =>
    results.filter((result) => result.outcome === outcome).length;
  return {
    created: count('created'),
    newVersions: count('new-version'),
    failed: count('failed') + count('not-attempted'),
    results: results.map((result) => ({
      name: result.planned.displayName,
      dir: label(result.planned),
      outcome: result.outcome,
      id: result.skill?.skill_id,
      version: result.skill
        ? `${result.skill.latest_version}.${result.skill.latest_minor_version}`
        : undefined,
      error: result.error,
    })),
  };
}

async function writeFile(root: string, relative: string, content: string) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, content, { flag: 'wx', mode: 0o600 });
}

/** A Claude Code marketplace with one plugin, two skills, and a command. */
export async function writeSamplePlugin(root: string, prefix: string) {
  const plugin = 'plugins/cookbook-import-check';
  const names = [`${prefix}-review`, `${prefix}-release`];
  await writeFile(
    root,
    '.claude-plugin/marketplace.json',
    `${JSON.stringify(
      {
        name: 'cookbook-import-check',
        owner: { name: 'Glean Cookbook' },
        plugins: [{ name: 'cookbook-import-check', source: `./${plugin}` }],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    root,
    `${plugin}/.claude-plugin/plugin.json`,
    `${JSON.stringify({ name: 'cookbook-import-check', version: '0.1.0' }, null, 2)}\n`,
  );
  await writeFile(
    root,
    `${plugin}/skills/${names[0]}/SKILL.md`,
    `---\nname: ${names[0]}\ndescription: Check a change against the review checklist before requesting review.\n---\n\n# Review checklist\n\nRead [the checklist](references/checklist.md) and confirm each item.\n`,
  );
  await writeFile(
    root,
    `${plugin}/skills/${names[0]}/references/checklist.md`,
    '# Checklist\n\n- Tests cover the change.\n- The description explains why.\n',
  );
  await writeFile(
    root,
    `${plugin}/skills/${names[1]}/SKILL.md`,
    `---\nname: ${names[1]}\ndescription: Draft release notes from merged changes.\n---\n\n# Release notes\n\nGroup merged changes by area and summarize each in one line.\n`,
  );
  await writeFile(
    root,
    `${plugin}/commands/hello.md`,
    '---\ndescription: Say hello\n---\n\nSay hello.\n',
  );
  return names;
}

export async function deleteCapturedIds(
  api: SkillsApi,
  ids: string[],
  log: Log,
) {
  const remaining: string[] = [];
  for (const id of ids) {
    log(`Deleting test skill ${id}...`);
    try {
      await api.delete(id);
    } catch {
      remaining.push(id);
    }
  }
  return remaining;
}

// The largest generated bundle is a few hundred bytes; this bounds the download.
const MAX_VERIFY_DOWNLOAD = 1024 * 1024;

/**
 * Publish a generated two-skill marketplace, compare each download with the
 * upload, and delete only the skills this run created.
 */
export async function verifyImport(
  api: SkillsApi,
  options: { workDir: string; log?: Log },
) {
  const log = options.log ?? (() => undefined);
  const prefix = `cookbook-import-${randomBytes(6).toString('hex')}`;
  const runRoot = path.join(options.workDir, prefix);
  const captured: string[] = [];
  let workError: unknown;
  let verified = 0;

  try {
    await fs.mkdir(runRoot, { recursive: true, mode: 0o700 });
    const names = await writeSamplePlugin(runRoot, prefix);
    log(`Generated a sample plugin with skills ${names.join(' and ')}.`);
    const plan = await planImport(api, await openPluginSource(runRoot), log);
    const planned = plan.skills.map(
      (entry) => `${entry.displayName}:${entry.action}`,
    );
    const expected = names.map((name) => `${name}:create`);
    if (planned.sort().join() !== expected.sort().join()) {
      throw new Error(
        `Unexpected import plan: ${planned.join(', ') || 'no skills'}.`,
      );
    }
    if (
      !plan.discovery.notices.some((notice) => notice.includes('1 command'))
    ) {
      throw new Error('The plan did not report the plugin command it skips.');
    }

    const results = await applyImport(api, selectSkills(plan), log);
    // Only a brand-new skill (version 1.1) is safe to delete as run-owned.
    for (const result of results) {
      if (result.outcome === 'created' && result.skill) {
        captured.push(result.skill.skill_id);
      }
    }
    for (const result of results) {
      if (result.outcome === 'failed' || result.outcome === 'not-attempted') {
        throw new Error(`${result.planned.displayName}: ${result.error}`);
      }
      if (result.outcome !== 'created') {
        throw new Error(
          `${result.skill?.skill_id} came back at version ${result.skill?.latest_version}.${result.skill?.latest_minor_version}, so it may be an existing skill. It was not deleted; inspect it.`,
        );
      }
    }

    for (const result of results) {
      const id = result.skill?.skill_id ?? '';
      log(
        `Downloading ${result.planned.displayName} and comparing its files...`,
      );
      const retrieved = await api.retrieve(id);
      if (retrieved.skill.skill_id !== id) {
        throw new Error('Direct retrieval returned a different skill.');
      }
      const response = await api.retrieveContent(id);
      const archive = await readStream(response.result, MAX_VERIFY_DOWNLOAD);
      await verifyDownloadedBundle(archive, result.planned.bundle.files);
      verified += 1;
    }
  } catch (error) {
    workError = error;
  }

  const remaining = await deleteCapturedIds(api, captured, log);
  await fs.rm(runRoot, { recursive: true, force: true });
  if (remaining.length > 0) throw new CleanupFailedError(remaining, workError);
  if (workError) {
    throw workError instanceof Error
      ? workError
      : new Error('Verification failed.');
  }
  return `Test import passed: published ${verified} generated skills, the downloaded files match, and both test skills were deleted.`;
}
