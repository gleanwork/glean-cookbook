import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { stageDownloadedBundle } from './bundle.js';

const roots: string[] = [];

async function destination(name: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-bundle-test-'));
  roots.push(root);
  return path.join(root, name);
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test('stages regular files with non-executable permissions', async () => {
  const archive = Buffer.from(
    zipSync({
      'sample/SKILL.md': strToU8('---\nname: sample\ndescription: safe\n---\n'),
      'sample/references/guide.md': strToU8('# Guide\n'),
    }),
  );
  const target = await destination('staged');

  await expect(stageDownloadedBundle(archive, target)).resolves.toEqual([
    'sample/SKILL.md',
    'sample/references/guide.md',
  ]);
  const mode =
    (await fs.stat(path.join(target, 'sample/SKILL.md'))).mode & 0o777;
  expect(mode).toBe(0o600);
});

test('rejects traversal and removes the partial sandbox', async () => {
  const archive = Buffer.from(
    zipSync({
      'safe/SKILL.md': strToU8('safe'),
      '../outside.txt': strToU8('unsafe'),
    }),
  );
  const target = await destination('staged');

  await expect(stageDownloadedBundle(archive, target)).rejects.toThrow(
    /Unsafe bundle path|invalid relative path/,
  );
  await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('rejects symbolic links', async () => {
  const archive = Buffer.from(
    zipSync({
      'SKILL.md': strToU8('safe'),
      link: [strToU8('SKILL.md'), { os: 3, attrs: 0o120777 << 16 }],
    }),
  );

  await expect(
    stageDownloadedBundle(archive, await destination('links')),
  ).rejects.toThrow(/Symbolic links are not allowed/);
});

test('enforces file and entry limits while writing', async () => {
  const archive = Buffer.from(
    zipSync({
      'SKILL.md': strToU8('12345'),
      'extra.md': strToU8('x'),
    }),
  );

  await expect(
    stageDownloadedBundle(archive, await destination('files'), {
      maxEntries: 1,
      maxFileBytes: 10,
      maxTotalBytes: 10,
    }),
  ).rejects.toThrow(/more than 1 entries/);

  await expect(
    stageDownloadedBundle(archive, await destination('bytes'), {
      maxEntries: 10,
      maxFileBytes: 4,
      maxTotalBytes: 10,
    }),
  ).rejects.toThrow(/per-file size limit/);
});

test('never overwrites an existing sandbox', async () => {
  const archive = Buffer.from(zipSync({ 'SKILL.md': strToU8('safe') }));
  const target = await destination('staged');
  await fs.mkdir(target);

  await expect(stageDownloadedBundle(archive, target)).rejects.toMatchObject({
    code: 'EEXIST',
  });
});
