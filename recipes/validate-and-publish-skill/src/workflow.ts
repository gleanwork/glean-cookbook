import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Glean } from '@gleanwork/api-client';
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

export async function findSkillById(api: SkillsApi, skillId: string) {
  let cursor: string | undefined;
  do {
    const page = await api.list(100, cursor);
    if (page.skills.some((skill) => skill.id === skillId)) return true;
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return false;
}

export async function verifyFirstPersist(
  api: SkillsApi,
  options: {
    workDir: string;
    cleanup: boolean;
    log?: (message: string) => void;
  },
): Promise<FirstPersistResult> {
  const log = options.log ?? (() => undefined);
  const uniqueName = `cookbook-validate-${randomBytes(8).toString('hex')}`;
  const runRoot = path.join(options.workDir, uniqueName);
  const skillPath = path.join(runRoot, 'SKILL.md');
  const contentPath = path.join(runRoot, 'downloaded', `${uniqueName}.content`);
  let createdId: string | undefined;

  await fs.mkdir(runRoot, { recursive: true, mode: 0o700 });
  await fs.writeFile(skillPath, manifest(uniqueName), {
    flag: 'wx',
    mode: 0o600,
  });

  try {
    log('Validating the local SKILL.md without persisting it...');
    const bundle = await readSkillMd(skillPath);
    const validation = await api.validate({ file: bundle });
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
      await api.validate({ file: await readSkillMd(invalidPath) });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Invalid SKILL.md unexpectedly validated.');

    log('Publishing the uniquely named skill once...');
    const created = await api.create({ file: bundle });
    createdId = created.skill.id;
    if (created.skill.display_name !== uniqueName) {
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
    if (!bytes.toString('utf8').includes(uniqueName) && !isZip) {
      throw new Error(
        'Downloaded content does not include the published name.',
      );
    }
    const saved = await saveLatestContent(bytes, contentPath);

    return {
      id: createdId,
      displayName: created.skill.display_name,
      version: created.skill.latest_version,
      minorVersion: created.skill.latest_minor_version,
      contentPath: saved,
      contentBytes: bytes.byteLength,
    };
  } finally {
    if (createdId && options.cleanup) {
      log(`Deleting run-owned skill ${createdId}...`);
      try {
        await api.delete(createdId);
      } catch (error) {
        log(
          `Cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await fs.rm(runRoot, { recursive: true, force: true });
  }
}
