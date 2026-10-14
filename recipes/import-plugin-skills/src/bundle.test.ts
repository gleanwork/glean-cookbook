import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { buildBundle, verifyDownloadedBundle } from './bundle.js';
import { discoverSkills } from './discover.js';
import { openPluginSource } from './plugin-source.js';
import { removeTrees, skillMd, writeTree } from './test-helpers.js';

afterEach(removeTrees);

async function bundleFor(files: Record<string, string>) {
  const source = await openPluginSource(await writeTree(files));
  const [skill] = (await discoverSkills(source)).skills;
  return buildBundle(source, skill!);
}

test('zips a skill folder with its files at the archive root', async () => {
  const bundle = await bundleFor({
    'skills/review/SKILL.md': skillMd('review'),
    'skills/review/references/checklist.md': '# Checklist\n',
  });
  expect(bundle.fileName).toBe('review.zip');
  expect(Object.keys(unzipSync(bundle.content)).sort()).toEqual([
    'SKILL.md',
    'references/checklist.md',
  ]);
});

test('gives identical folders the same digest and archive bytes', async () => {
  const files = {
    'skills/a/SKILL.md': skillMd('a'),
    'skills/a/notes.md': 'n\n',
  };
  const first = await bundleFor(files);
  const second = await bundleFor(files);
  expect(second.digest).toBe(first.digest);
  expect(Buffer.from(second.content).equals(Buffer.from(first.content))).toBe(
    true,
  );
  const changed = await bundleFor({
    ...files,
    'skills/a/notes.md': 'changed\n',
  });
  expect(changed.digest).not.toBe(first.digest);
});

test('accepts a download with the same files and rejects changed, extra, or missing ones', async () => {
  const uploaded = new Map([
    ['SKILL.md', strToU8(skillMd('a'))],
    ['notes.md', strToU8('notes\n')],
  ]);
  const zip = (files: Record<string, string>) =>
    Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
        ),
      ),
    );

  await verifyDownloadedBundle(
    zip({ 'SKILL.md': skillMd('a'), 'notes.md': 'notes\n' }),
    uploaded,
  );
  await expect(
    verifyDownloadedBundle(
      zip({ 'SKILL.md': skillMd('a'), 'notes.md': 'NOTES\n' }),
      uploaded,
    ),
  ).rejects.toThrow('notes.md does not match the uploaded file.');
  await expect(
    verifyDownloadedBundle(
      zip({ 'SKILL.md': skillMd('a'), 'notes.md': 'notes\n', 'run.sh': 'x' }),
      uploaded,
    ),
  ).rejects.toThrow('unexpected entry: run.sh');
  await expect(
    verifyDownloadedBundle(zip({ 'SKILL.md': skillMd('a') }), uploaded),
  ).rejects.toThrow('missing notes.md');
});
