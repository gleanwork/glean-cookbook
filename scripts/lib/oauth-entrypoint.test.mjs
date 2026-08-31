import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import { hasRecipeOwnedOAuth } from './oauth-entrypoint.mjs';

async function createRecipe(context, packageJson, files = {}) {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'oauth-entrypoint-'),
  );
  context.after(() => fs.remove(repoRoot));
  const target = 'recipes/example';
  const recipeRoot = path.join(repoRoot, target);
  await fs.outputJson(path.join(recipeRoot, 'package.json'), packageJson);
  for (const [file, contents] of Object.entries(files)) {
    await fs.outputFile(path.join(recipeRoot, file), contents);
  }
  return { repoRoot, target };
}

test('recognizes the installed Glean auth CLI as recipe-owned OAuth', async (context) => {
  const fixture = await createRecipe(context, {
    scripts: { login: 'glean-auth login --scopes search' },
    dependencies: { '@gleanwork/auth': '0.5.1' },
  });

  assert.equal(hasRecipeOwnedOAuth(fixture.repoRoot, fixture.target), true);
});

test('does not trust a glean-auth script without the package dependency', async (context) => {
  const fixture = await createRecipe(context, {
    scripts: { login: 'glean-auth login --scopes search' },
  });

  assert.equal(hasRecipeOwnedOAuth(fixture.repoRoot, fixture.target), false);
});

test('accepts a recipe-owned source entry point only when it exists', async (context) => {
  const fixture = await createRecipe(context, {
    scripts: { login: 'tsx src/login.ts' },
  });

  assert.equal(hasRecipeOwnedOAuth(fixture.repoRoot, fixture.target), false);
  await fs.outputFile(
    path.join(fixture.repoRoot, fixture.target, 'src/login.ts'),
    'export {};\n',
  );
  assert.equal(hasRecipeOwnedOAuth(fixture.repoRoot, fixture.target), true);
});

test('rejects placeholder and generated shared-helper commands', async (context) => {
  const fixture = await createRecipe(context, {
    scripts: { login: 'echo TODO' },
  });
  const packageFile = path.join(
    fixture.repoRoot,
    fixture.target,
    'package.json',
  );

  assert.equal(hasRecipeOwnedOAuth(fixture.repoRoot, fixture.target), false);

  await fs.outputJson(packageFile, {
    scripts: { login: 'node scripts/glean-auth.mjs login' },
  });
  await fs.outputFile(
    path.join(fixture.repoRoot, fixture.target, 'scripts/glean-auth.mjs'),
    '#!/usr/bin/env node\n',
  );
  assert.equal(hasRecipeOwnedOAuth(fixture.repoRoot, fixture.target), false);
});
