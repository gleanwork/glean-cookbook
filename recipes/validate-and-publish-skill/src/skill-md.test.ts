import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { readSkillMd, readStream, saveLatestContent } from './skill-md.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test('reads a local SKILL.md and rejects other filenames', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-md-'));
  roots.push(root);
  const skillPath = path.join(root, 'SKILL.md');
  const zipPath = path.join(root, 'bundle.zip');
  await fs.writeFile(skillPath, '---\nname: sample\n---\n');
  await fs.writeFile(zipPath, 'not-a-skill');

  await expect(readSkillMd(skillPath)).resolves.toMatchObject({
    fileName: 'SKILL.md',
  });
  await expect(readSkillMd(zipPath)).rejects.toThrow(/SKILL\.md/);
});

test('saves latest content bytes without unpacking them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-content-'));
  roots.push(root);
  const destination = path.join(root, 'downloaded', 'skill.content');
  const bytes = await readStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('name: cookbook-validate-sample'));
        controller.close();
      },
    }),
  );

  await expect(saveLatestContent(bytes, destination)).resolves.toBe(
    destination,
  );
  await expect(fs.readFile(destination, 'utf8')).resolves.toContain(
    'cookbook-validate-sample',
  );
});
