import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  discoverRecipePackageScripts,
  runRecipePackageScripts,
  selectedScript,
} from './recipe-package-scripts.mjs';

async function writePackage(root, relativeDirectory, packageJson, lock = true) {
  const directory = path.join(root, relativeDirectory);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  if (lock) {
    await fs.writeFile(
      path.join(directory, 'package-lock.json'),
      '{"lockfileVersion":3}\n',
    );
  }
}

test('prefers check over test and ignores packages with neither', () => {
  assert.equal(
    selectedScript({ scripts: { check: 'check', test: 'test' } }),
    'check',
  );
  assert.equal(selectedScript({ scripts: { test: 'test' } }), 'test');
  assert.equal(selectedScript({ scripts: { start: 'start' } }), undefined);
});

test('discovers nested recipe packages in deterministic order', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recipe-packages-'));
  await writePackage(root, 'recipes/zeta', {
    name: 'zeta',
    scripts: { test: 'node --test' },
  });
  await writePackage(root, 'recipes/alpha/nested', {
    name: 'alpha',
    scripts: { check: 'npm test', test: 'node --test' },
  });
  await writePackage(root, 'examples/no-tests', {
    name: 'no-tests',
    scripts: { start: 'node index.js' },
  });

  assert.deepEqual(await discoverRecipePackageScripts(root), [
    {
      directory: path.join(root, 'recipes/alpha/nested'),
      name: 'alpha',
      relativeDirectory: 'recipes/alpha/nested',
      script: 'check',
    },
    {
      directory: path.join(root, 'recipes/zeta'),
      name: 'zeta',
      relativeDirectory: 'recipes/zeta',
      script: 'test',
    },
  ]);
});

test('requires standalone package locks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recipe-packages-'));
  await writePackage(
    root,
    'recipes/unlocked',
    { scripts: { test: 'node --test' } },
    false,
  );

  await assert.rejects(
    discoverRecipePackageScripts(root),
    /declares test but has no package-lock\.json/u,
  );
});

test('installs and runs one selected script per package', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recipe-packages-'));
  await writePackage(root, 'recipes/example', {
    name: 'example',
    scripts: { check: 'npm test', test: 'node --test' },
  });
  const calls = [];

  const results = await runRecipePackageScripts({
    repoRoot: root,
    run: async (command, args, recipePackage) => {
      calls.push([command, args, recipePackage.relativeDirectory]);
    },
  });

  assert.deepEqual(calls, [
    ['npm', ['ci'], 'recipes/example'],
    ['npm', ['run', 'check'], 'recipes/example'],
  ]);
  assert.equal(results.length, 1);
});
