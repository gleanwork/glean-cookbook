import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Glean } from '@gleanwork/api-client';
import { CleanupFailedError } from './errors.js';
import { readSkillMd, readStream, saveLatestContent } from './skill-md.js';

export type SkillsApi = Pick<
  Glean['skills'],
  'create' | 'delete' | 'list' | 'retrieve' | 'retrieveContent' | 'validate'
>;

export interface FirstPersistResult {
  id: string;
  displayName: string;
  version: number;
  minorVersion: number;
  contentPath: string;
  contentBytes: number;
}

function manifest(displayName: string) {
  return `---\nname: ${displayName}\ndescription: Cookbook first-persist verification for the Skills API.\n---\n\n# First persist verification\n\nThis fixture verifies a first Skills persist. It contains no executable code.\n`;
}

function rethrow(error: unknown): never {
  throw error instanceof Error ? error : new Error('Verification failed.');
}

export function cleanupCommand(skillId: string) {
  return `npm start -- cleanup --id ${skillId} --yes`;
}

export function verifiedSuccessLine(result: FirstPersistResult) {
  return `Verified ${result.displayName} (${result.id}) at version ${result.version}.${result.minorVersion}; downloaded ${result.contentBytes} byte(s); cleanup completed.`;
}

export async function findSkillById(api: SkillsApi, skillId: string) {
  let cursor: string | undefined;
  do {
    const page = await api.list(100, cursor);
    if (page.skills.some((skill) => skill.id === skillId)) return true;
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return false;
}

export async function findSkillByName(api: SkillsApi, displayName: string) {
  let cursor: string | undefined;
  do {
    const page = await api.list(100, cursor);
    const match = page.skills.find(
      (skill) => skill.display_name === displayName,
    );
    if (match) return match.id;
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return undefined;
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

async function rejectInvalidFrontmatter(api: SkillsApi, runRoot: string) {
  const invalidPath = path.join(runRoot, 'invalid', 'SKILL.md');
  await fs.mkdir(path.dirname(invalidPath), { recursive: true });
  await fs.writeFile(invalidPath, '# Missing frontmatter\n', {
    flag: 'wx',
    mode: 0o600,
  });
  let rejected = false;
  try {
    await api.validate({ file: await readSkillMd(invalidPath) });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Invalid SKILL.md unexpectedly validated.');
}

export async function verifyFirstPersist(
  api: SkillsApi,
  options: {
    workDir: string;
    cleanup: boolean;
    bundlePath?: string;
    log?: (message: string) => void;
  },
): Promise<FirstPersistResult> {
  const log = options.log ?? (() => undefined);
  const uniqueName = `cookbook-validate-${randomBytes(8).toString('hex')}`;
  const runRoot = path.join(options.workDir, uniqueName);
  const skillPath = options.bundlePath
    ? path.resolve(options.bundlePath)
    : path.join(runRoot, 'SKILL.md');
  const contentPath = path.join(runRoot, 'downloaded', `${uniqueName}.content`);
  let createdId: string | undefined;
  let result: FirstPersistResult | undefined;
  let workError: unknown;

  await fs.mkdir(runRoot, { recursive: true, mode: 0o700 });
  if (!options.bundlePath) {
    await fs.writeFile(skillPath, manifest(uniqueName), {
      flag: 'wx',
      mode: 0o600,
    });
  }

  try {
    log('Validating the local SKILL.md without persisting it...');
    const bundle = await readSkillMd(skillPath);
    const validation = await api.validate({ file: bundle });
    const displayName = validation.metadata.display_name;
    if (!options.bundlePath && displayName !== uniqueName) {
      throw new Error('Validation returned an unexpected skill name.');
    }

    log('Confirming invalid frontmatter is rejected without a create call...');
    await rejectInvalidFrontmatter(api, runRoot);

    if (options.bundlePath) {
      const existing = await findSkillByName(api, displayName);
      if (existing) {
        throw new Error(
          `A skill named "${displayName}" already exists as ${existing}. This first persist does not add versions.`,
        );
      }
    }

    log('Publishing the skill once...');
    const created = await api.create({ file: bundle });
    createdId = created.skill.id;
    if (created.skill.display_name !== displayName) {
      throw new Error('Created skill name does not match validated metadata.');
    }

    log('Confirming list and get return the captured ID...');
    if (!(await findSkillById(api, createdId))) {
      throw new Error('List did not include the skill this run just created.');
    }
    const retrieved = await api.retrieve(createdId);
    if (retrieved.skill.id !== createdId) {
      throw new Error('Direct retrieval returned a different skill.');
    }

    log('Downloading the latest skill content without unpacking it...');
    const response = await api.retrieveContent(createdId);
    const bytes = await readStream(response.result);
    if (bytes.byteLength === 0) {
      throw new Error('Latest skill content was empty.');
    }
    const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!bytes.toString('utf8').includes(displayName) && !isZip) {
      throw new Error(
        'Downloaded content does not include the published name.',
      );
    }
    const saved = await saveLatestContent(bytes, contentPath);

    result = {
      id: createdId,
      displayName: created.skill.display_name,
      version: created.skill.latest_version,
      minorVersion: created.skill.latest_minor_version,
      contentPath: saved,
      contentBytes: bytes.byteLength,
    };
  } catch (error) {
    workError = error;
  }

  const remaining =
    createdId && options.cleanup
      ? await deleteCapturedIds(api, [createdId], log)
      : [];
  await fs.rm(runRoot, { recursive: true, force: true });
  if (remaining.length > 0) {
    throw new CleanupFailedError(
      remaining,
      remaining.map((id) => cleanupCommand(id)).join('\n  '),
    );
  }
  if (workError) rethrow(workError);
  if (!result) throw new Error('Verification did not produce a result.');
  return result;
}
