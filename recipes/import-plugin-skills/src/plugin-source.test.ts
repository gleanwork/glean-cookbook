import fs from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { discoverSkills } from './discover.js';
import { openPluginSource } from './plugin-source.js';
import { removeTrees, skillMd, writeTree } from './test-helpers.js';

afterEach(removeTrees);

test('walks a folder without following symbolic links or reading .git and node_modules', async () => {
  const root = await writeTree({
    'skills/a/SKILL.md': skillMd('a'),
    '.git/config': '[core]\n',
    'node_modules/pkg/index.js': '',
  });
  await fs.symlink('/etc/hosts', path.join(root, 'skills/a/hosts'));

  const source = await openPluginSource(root);
  expect([...source.files]).toEqual(['skills/a/SKILL.md']);
  expect(source.skipped).toEqual([
    { path: 'skills/a/hosts', reason: 'symbolic link' },
  ]);
  expect((await discoverSkills(source)).notices).toEqual([
    'skills/a/hosts (symbolic link) is not uploaded with skills/a.',
  ]);
});

test('reads a GitHub-style zip in memory and strips its top-level folder', async () => {
  const root = await writeTree({});
  const zipPath = path.join(root, 'plugins-main.zip');
  await fs.writeFile(
    zipPath,
    zipSync({
      'plugins-main/skills/a/SKILL.md': strToU8(skillMd('a')),
      'plugins-main/skills/a/link': [
        strToU8('/etc/passwd'),
        { os: 3, attrs: (0o120777 << 16) >>> 0 },
      ],
    }),
  );

  const source = await openPluginSource(zipPath);
  expect([...source.files]).toEqual(['skills/a/SKILL.md']);
  expect(new TextDecoder().decode(await source.read('skills/a/SKILL.md'))).toBe(
    skillMd('a'),
  );
  expect(source.skipped).toEqual([
    { path: 'skills/a/link', reason: 'symbolic link' },
  ]);
});

test('rejects a zip entry that escapes the archive', async () => {
  const root = await writeTree({});
  const zipPath = path.join(root, 'evil.zip');
  await fs.writeFile(
    zipPath,
    zipSync({ '../evil/SKILL.md': strToU8(skillMd('evil')) }),
  );
  await expect(openPluginSource(zipPath)).rejects.toThrow(
    /invalid relative path/,
  );
});

test('rejects inputs that are neither a folder nor a zip', async () => {
  const root = await writeTree({ 'notes.txt': 'hi' });
  await expect(openPluginSource(path.join(root, 'missing'))).rejects.toThrow(
    /No plugin folder or zip/,
  );
  await expect(openPluginSource(path.join(root, 'notes.txt'))).rejects.toThrow(
    'Pass a plugin folder or a .zip file.',
  );
});
