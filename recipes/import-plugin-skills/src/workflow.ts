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
import { CleanupFailedError, formatCliError, httpStatus } from './errors.js';
import { openPluginSource, type PluginSource } from './plugin-source.js';

export type SkillsApi = Pick<
  Glean['skills'],
  'create' | 'delete' | 'list' | 'retrieve' | 'retrieveContent' | 'validate'
>;

export type PlanAction =
  'create' | 'new-version' | 'unchanged' | 'invalid' | 'conflict';

export interface PlannedSkill {
  bundle: SkillBundle;
  action: PlanAction;
  displayName?: string;
  /** Other folders with byte-identical content, uploaded once. */
  duplicates: string[];
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

// Statuses that mean this bundle was rejected, not that the run is broken.
const BUNDLE_REJECTED = new Set([400, 413, 422]);
// Statuses that will fail every remaining upload the same way.
const RUN_BLOCKED = new Set([401, 403, 404]);

function label(planned: PlannedSkill) {
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

export async function planImport(
  api: SkillsApi,
  source: PluginSource,
  options: {
    plugins?: string[];
    skills?: string[];
    log?: (message: string) => void;
  } = {},
): Promise<ImportPlan> {
  const log = options.log ?? (() => undefined);
  const discovery = await discoverSkills(source, { plugins: options.plugins });

  const unique = new Map<string, PlannedSkill>();
  const planned: PlannedSkill[] = [];
  for (const skill of discovery.skills) {
    let bundle: SkillBundle;
    try {
      bundle = await buildBundle(source, skill);
    } catch (error) {
      planned.push({
        bundle: {
          skill,
          fileName: '',
          content: new Uint8Array(),
          files: new Map(),
          digest: '',
        },
        action: 'invalid',
        duplicates: [],
        existing: [],
        problem: formatCliError(error).error,
        warnings: [],
      });
      continue;
    }
    const same = unique.get(bundle.digest);
    if (same) {
      same.duplicates.push(skill.dir || '(plugin root)');
      continue;
    }
    const entry: PlannedSkill = {
      bundle,
      action: 'create',
      duplicates: [],
      existing: [],
      warnings: [],
    };
    unique.set(bundle.digest, entry);
    planned.push(entry);
  }

  for (const entry of planned) {
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
      entry.problem = formatCliError(error).error;
    }
  }

  let selected = planned;
  if (options.skills && options.skills.length > 0) {
    const wanted = new Set(options.skills);
    const matches = (entry: PlannedSkill) =>
      (entry.displayName !== undefined && wanted.has(entry.displayName)) ||
      wanted.has(path.posix.basename(entry.bundle.skill.dir));
    selected = planned.filter(matches);
    const found = new Set(
      selected.flatMap((entry) => [
        entry.displayName,
        path.posix.basename(entry.bundle.skill.dir),
      ]),
    );
    const missing = [...wanted].filter((name) => !found.has(name));
    if (missing.length > 0) {
      throw new Error(`No discovered skill named ${missing.join(', ')}.`);
    }
  }

  // Two different bundles with one name would overwrite each other.
  const byName = new Map<string, PlannedSkill[]>();
  for (const entry of selected) {
    if (entry.displayName === undefined || entry.action === 'invalid') continue;
    byName.set(entry.displayName, [
      ...(byName.get(entry.displayName) ?? []),
      entry,
    ]);
  }
  for (const [name, entries] of byName) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      entry.action = 'conflict';
      entry.problem = `${entries.length} different skills are named "${name}": ${entries.map(label).join(', ')}. Import them separately with --plugin, or rename one.`;
    }
  }

  if (selected.some((entry) => entry.action === 'create')) {
    log('Checking which skill names already exist...');
    const existing = await listSkillsByName(api);
    for (const entry of selected) {
      if (entry.action !== 'create' || entry.displayName === undefined)
        continue;
      entry.existing = existing.get(entry.displayName) ?? [];
      if (entry.existing.length > 0) entry.action = 'new-version';
    }
  }

  // Skip a skill whose latest published files already match, so running the
  // import again publishes only what changed.
  for (const entry of selected) {
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

  return { location: source.location, discovery, skills: selected };
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

export function importable(plan: ImportPlan) {
  return plan.skills.filter(
    (entry) => entry.action === 'create' || entry.action === 'new-version',
  );
}

export async function applyImport(
  api: SkillsApi,
  plan: ImportPlan,
  log: (message: string) => void = () => undefined,
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  let blocked: string | undefined;
  for (const planned of importable(plan)) {
    if (blocked) {
      results.push({ planned, outcome: 'not-attempted', error: blocked });
      continue;
    }
    log(`Publishing ${planned.displayName} from ${label(planned)}...`);
    try {
      // Create supersedes your own same-name skill with a new version. Never
      // retry it: a timed-out request may still have saved the skill.
      const created = await api.create(
        {
          file: {
            fileName: planned.bundle.fileName,
            content: planned.bundle.content,
          },
        },
        { retries: { strategy: 'none' } },
      );
      const { skill } = created;
      const isNew =
        skill.latest_version === 1 && skill.latest_minor_version === 1;
      results.push({
        planned,
        outcome: isNew ? 'created' : 'new-version',
        skill,
      });
    } catch (error) {
      const formatted = formatCliError(error);
      const message = formatted.hint
        ? `${formatted.error} (${formatted.hint})`
        : formatted.error;
      results.push({ planned, outcome: 'failed', error: message });
      if (RUN_BLOCKED.has(httpStatus(error) ?? 0)) {
        blocked = `Not attempted after: ${formatted.error}`;
      }
    }
  }
  return results;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const LAYOUTS: Record<Discovery['layout'], string> = {
  marketplace: 'plugin marketplace',
  plugin: 'plugin',
  skills: 'skills folder',
  recursive: 'folder (searched for SKILL.md files)',
};

export function formatPlan(plan: ImportPlan) {
  const { discovery } = plan;
  const lines = [
    `Found ${plural(plan.skills.length, 'skill')} in ${plan.location} (${LAYOUTS[discovery.layout]}${
      discovery.plugins.length > 0 ? `: ${discovery.plugins.join(', ')}` : ''
    }).`,
  ];
  const actions: Record<PlanAction, string> = {
    create: 'create',
    'new-version': 'update',
    unchanged: 'unchanged',
    invalid: 'invalid',
    conflict: 'conflict',
  };
  const width = Math.max(
    0,
    ...plan.skills.map((entry) => (entry.displayName ?? '?').length),
  );
  for (const entry of plan.skills) {
    const name = (entry.displayName ?? '?').padEnd(width);
    const files = plural(entry.bundle.files.size, 'file');
    lines.push(
      `  ${actions[entry.action].padEnd(9)} ${name}  ${label(entry)} (${files})`,
    );
    for (const existing of entry.action === 'unchanged' ? [] : entry.existing) {
      const managed =
        existing.origin === 'GITHUB'
          ? ' It was imported from GitHub, so its owner must sync it instead; an upload by its owner is rejected.'
          : '';
      lines.push(
        `            exists as ${existing.skill_id} at version ${existing.latest_version}.${existing.latest_minor_version}, owned by ${existing.owner.name}. If that is you, this adds a version; otherwise it creates your own skill with the same name.${managed}`,
      );
    }
    for (const duplicate of entry.duplicates) {
      lines.push(`            identical copy at ${duplicate}; uploaded once`);
    }
    if (entry.action === 'unchanged') {
      const [same] = entry.existing;
      lines.push(
        `            matches ${same?.skill_id} at version ${same?.latest_version}.${same?.latest_minor_version}, owned by ${same?.owner.name}; not uploaded`,
      );
    }
    if (entry.problem) lines.push(`            ${entry.problem}`);
    for (const warning of entry.warnings)
      lines.push(`            warning: ${warning}`);
  }
  if (discovery.notices.length > 0) {
    lines.push('Notes:');
    for (const notice of discovery.notices) lines.push(`  ${notice}`);
  }
  return lines.join('\n');
}

export function summarize(plan: ImportPlan, results: ImportResult[]) {
  const count = (outcome: Outcome) =>
    results.filter((result) => result.outcome === outcome).length;
  const lines: string[] = [];
  for (const result of results) {
    const name = result.planned.displayName ?? '?';
    if (result.skill) {
      const { skill_id, latest_version, latest_minor_version } = result.skill;
      lines.push(
        `  ${result.outcome === 'created' ? 'created' : 'updated'}  ${name} (${skill_id}) at version ${latest_version}.${latest_minor_version}`,
      );
    } else {
      lines.push(`  ${result.outcome}  ${name}: ${result.error}`);
    }
  }
  const rejected = plan.skills.filter(
    (entry) => entry.action === 'invalid' || entry.action === 'conflict',
  ).length;
  const failed = count('failed') + count('not-attempted');
  const published = count('created') + count('new-version');
  const unchanged = plan.skills.filter(
    (entry) => entry.action === 'unchanged',
  ).length;
  lines.push(
    `Published ${plural(published, 'skill')} from ${plan.location}: ${count('created')} created, ${plural(count('new-version'), 'new version')}, ${unchanged} unchanged.`,
  );
  if (failed + rejected > 0) {
    lines.push(
      `Not published: ${plural(failed, 'failed upload')}, ${plural(rejected, 'invalid or conflicting skill')}.`,
    );
  }
  return { text: lines.join('\n'), complete: failed + rejected === 0 };
}

export function cleanupCommand(
  skillId: string,
  auth: { email?: string; serverUrl?: string } = {},
) {
  const parts = [`npm start -- cleanup --id ${skillId} --yes`];
  if (auth.serverUrl?.trim())
    parts.push(`--server-url ${auth.serverUrl.trim()}`);
  else if (auth.email?.trim()) parts.push(`--email ${auth.email.trim()}`);
  return parts.join(' ');
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
  log: (message: string) => void,
) {
  const remaining: string[] = [];
  for (const id of ids) {
    log(`Deleting run-owned skill ${id}...`);
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

export async function verifyImport(
  api: SkillsApi,
  options: {
    workDir: string;
    auth?: { email?: string; serverUrl?: string };
    log?: (message: string) => void;
  },
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
    const plan = await planImport(api, await openPluginSource(runRoot), {
      log,
    });
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

    const results = await applyImport(api, plan, log);
    for (const result of results) {
      if (!result.skill)
        throw new Error(`${result.planned.displayName}: ${result.error}`);
      // Only a brand-new skill (version 1.1) is safe to delete as run-owned.
      if (result.outcome !== 'created') {
        throw new Error(
          `${result.skill.skill_id} came back at version ${result.skill.latest_version}.${result.skill.latest_minor_version}, so it may be an existing skill. It was not deleted; inspect it.`,
        );
      }
      captured.push(result.skill.skill_id);
    }

    for (const result of results) {
      const id = result.skill!.skill_id;
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
  if (remaining.length > 0) {
    throw new CleanupFailedError(
      remaining,
      remaining.map((id) => cleanupCommand(id, options.auth)).join('\n  '),
      workError,
    );
  }
  if (workError) {
    throw workError instanceof Error
      ? workError
      : new Error('Verification failed.');
  }
  return `Verified plugin import: published ${verified} skills from a generated Claude Code marketplace, downloaded files match, cleanup completed.`;
}
