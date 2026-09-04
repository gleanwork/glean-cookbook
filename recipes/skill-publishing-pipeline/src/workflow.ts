import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Glean } from '@gleanwork/api-client';
import { CleanupFailedError } from './errors.js';
import { readBundle, readStream, stageDownloadedBundle } from './bundle.js';

export type SkillsApi = Pick<
  Glean['skills'],
  | 'create'
  | 'delete'
  | 'list'
  | 'listVersions'
  | 'retrieve'
  | 'retrieveContent'
  | 'retrieveVersion'
  | 'retrieveVersionContent'
  | 'validate'
>;

export interface PublishResult {
  id: string;
  displayName: string;
  version: number;
  minorVersion: number;
}

function rethrow(error: unknown): never {
  throw error instanceof Error ? error : new Error('Verification failed.');
}

export function cleanupCommand(skillId: string) {
  return `npm start -- cleanup --id ${skillId} --yes`;
}

export function verifiedSuccessLine(result: PublishResult) {
  return `Verified ${result.displayName} (${result.id}) at version ${result.version}.${result.minorVersion}; cleanup completed.`;
}

export function stagingDestination(
  stageDir: string,
  id: string,
  version: number,
  minorVersion: number,
) {
  return path.resolve(stageDir, id, `v${version}.${minorVersion}`);
}

export async function findSkillByName(
  api: SkillsApi,
  displayName: string,
): Promise<string | undefined> {
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

export async function publishBundle(
  api: SkillsApi,
  bundlePath: string,
): Promise<PublishResult> {
  const bundle = await readBundle(bundlePath);
  const validation = await api.validate({ file: bundle });
  const created = await api.create({ file: bundle });
  if (created.skill.display_name !== validation.metadata.display_name) {
    throw new Error('Published skill name does not match validated metadata.');
  }
  return {
    id: created.skill.id,
    displayName: created.skill.display_name,
    version: created.skill.latest_version,
    minorVersion: created.skill.latest_minor_version,
  };
}

function manifest(displayName: string, description: string) {
  return `---\nname: ${displayName}\ndescription: ${description}\n---\n\n# Publishing verification\n\nThis fixture verifies the Skills publishing lifecycle. It contains no executable code.\n`;
}

function versionAdvanced(
  first: { latest_version: number; latest_minor_version: number },
  second: { latest_version: number; latest_minor_version: number },
) {
  return (
    second.latest_version > first.latest_version ||
    (second.latest_version === first.latest_version &&
      second.latest_minor_version > first.latest_minor_version)
  );
}

async function assertManifest(
  api: SkillsApi,
  skillId: string,
  expectedName: string,
  destination: string,
  version?: number,
) {
  const response =
    version === undefined
      ? await api.retrieveContent(skillId)
      : await api.retrieveVersionContent(skillId, version);
  const archive = await readStream(response.result);
  const files = await stageDownloadedBundle(archive, destination);
  const manifestPath = files.find(
    (file) => path.posix.basename(file) === 'SKILL.md',
  );
  if (!manifestPath) throw new Error('Staged bundle has no SKILL.md.');
  const content = await fs.readFile(
    path.join(destination, manifestPath),
    'utf8',
  );
  if (!content.includes(`name: ${expectedName}`)) {
    throw new Error('Downloaded SKILL.md does not match the published skill.');
  }
}

export async function verifyPublishingLifecycle(
  api: SkillsApi,
  options: {
    workDir: string;
    cleanup: boolean;
    log?: (message: string) => void;
  },
): Promise<PublishResult> {
  const log = options.log ?? (() => undefined);
  const uniqueName = `cookbook-publish-${randomBytes(8).toString('hex')}`;
  const runRoot = path.join(options.workDir, uniqueName);
  const firstPath = path.join(runRoot, 'v1', 'SKILL.md');
  const secondPath = path.join(runRoot, 'v2', 'SKILL.md');
  let createdId: string | undefined;
  let result: PublishResult | undefined;
  let workError: unknown;

  await fs.mkdir(path.dirname(firstPath), { recursive: true });
  await fs.mkdir(path.dirname(secondPath), { recursive: true });
  await fs.writeFile(
    firstPath,
    manifest(uniqueName, 'Cookbook publishing verification version one.'),
    { flag: 'wx', mode: 0o600 },
  );
  await fs.writeFile(
    secondPath,
    manifest(uniqueName, 'Cookbook publishing verification version two.'),
    { flag: 'wx', mode: 0o600 },
  );

  try {
    log('Validating the first bundle without persisting it...');
    const firstBundle = await readBundle(firstPath);
    const validation = await api.validate({ file: firstBundle });
    if (validation.metadata.display_name !== uniqueName) {
      throw new Error('Validation returned an unexpected skill name.');
    }

    log('Confirming invalid frontmatter is rejected without a create call...');
    const invalidPath = path.join(runRoot, 'invalid', 'SKILL.md');
    await fs.mkdir(path.dirname(invalidPath), { recursive: true });
    await fs.writeFile(invalidPath, '# Missing frontmatter\n', {
      flag: 'wx',
      mode: 0o600,
    });
    let rejected = false;
    try {
      await api.validate({ file: await readBundle(invalidPath) });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Invalid SKILL.md unexpectedly validated.');

    log('Publishing the first version of a uniquely named skill...');
    const first = await api.create({ file: firstBundle });
    createdId = first.skill.id;
    const retrieved = await api.retrieve(createdId);
    if (retrieved.skill.id !== createdId) {
      throw new Error('Direct retrieval returned a different skill.');
    }
    await assertManifest(
      api,
      createdId,
      uniqueName,
      path.join(runRoot, 'staged-latest-v1'),
    );

    log('Publishing the same name again to create a newer version...');
    const second = await api.create({ file: await readBundle(secondPath) });
    if (second.skill.id !== createdId) {
      throw new Error('Name-based supersession created a different skill ID.');
    }
    if (!versionAdvanced(first.skill, second.skill)) {
      throw new Error('The second publish did not advance the skill version.');
    }

    const versions = await api.listVersions(createdId, 100);
    const latest = versions.versions.find(
      (version) =>
        version.version === second.skill.latest_version && version.is_latest,
    );
    if (!latest)
      throw new Error('The new version is missing from listVersions.');
    const version = await api.retrieveVersion(
      createdId,
      second.skill.latest_version,
    );
    if (version.version.skill_id !== createdId || !version.version.is_latest) {
      throw new Error(
        'Direct version retrieval did not return the latest version.',
      );
    }
    await assertManifest(
      api,
      createdId,
      uniqueName,
      path.join(runRoot, 'staged-version-v2'),
      second.skill.latest_version,
    );

    result = {
      id: createdId,
      displayName: second.skill.display_name,
      version: second.skill.latest_version,
      minorVersion: second.skill.latest_minor_version,
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
