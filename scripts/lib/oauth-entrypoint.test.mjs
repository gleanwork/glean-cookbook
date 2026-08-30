import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import { hasRecipeOwnedOAuth } from './oauth-entrypoint.mjs';

test('accepts a recipe-owned login script only when its entry point exists', async (context) => {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'oauth-entrypoint-'),
  );
  context.after(() => fs.remove(repoRoot));
  const target = 'recipes/example';
  await fs.outputJson(path.join(repoRoot, target, 'package.json'), {
    scripts: { login: 'tsx src/login.ts' },
  });

  assert.equal(hasRecipeOwnedOAuth(repoRoot, target), false);

  await fs.outputFile(
    path.join(repoRoot, target, 'src/login.ts'),
    'export {};\n',
  );
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target), true);
});

test('rejects placeholder and shared-helper login commands', async (context) => {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'oauth-entrypoint-'),
  );
  context.after(() => fs.remove(repoRoot));
  const target = 'recipes/example';
  const packageFile = path.join(repoRoot, target, 'package.json');

  await fs.outputJson(packageFile, { scripts: { login: 'echo TODO' } });
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target), false);

  await fs.outputJson(packageFile, {
    scripts: { login: 'node scripts/glean-auth.mjs login' },
  });
  await fs.outputFile(
    path.join(repoRoot, target, 'scripts/glean-auth.mjs'),
    '',
  );
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target), false);
});
