import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import {
  hasOfficialOAuthLogin,
  hasRecipeOwnedOAuth,
  legacyHelperScripts,
  oauthEntrypointKind,
} from './oauth-entrypoint.mjs';

const target = 'recipes/example';
const legacy = { [target]: 'legacy fixture' };

async function createRecipe(context, packageJson, files = {}) {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'oauth-entrypoint-'),
  );
  context.after(() => fs.remove(repoRoot));
  const recipeRoot = path.join(repoRoot, target);
  await fs.outputJson(path.join(recipeRoot, 'package.json'), packageJson);
  for (const [file, contents] of Object.entries(files)) {
    await fs.outputFile(path.join(recipeRoot, file), contents);
  }
  return repoRoot;
}

test('recognizes the pinned official Glean auth CLI', async (context) => {
  const repoRoot = await createRecipe(context, {
    scripts: { login: 'glean-auth login --scopes search' },
    dependencies: { '@gleanwork/auth': '1.0.0' },
  });

  assert.equal(hasOfficialOAuthLogin(repoRoot, target), true);
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target, {}), true);
  assert.equal(
    oauthEntrypointKind(repoRoot, target, {
      helperTargets: {},
      wrapperTargets: {},
    }),
    'official',
  );
});

test('requires the dependency and an exact pin', async (context) => {
  const missing = await createRecipe(context, {
    scripts: { login: 'glean-auth login --scopes search' },
  });
  assert.equal(hasRecipeOwnedOAuth(missing, target, {}), false);

  const ranged = await createRecipe(context, {
    scripts: { login: 'glean-auth login --scopes search' },
    dependencies: { '@gleanwork/auth': '^1.0.0' },
  });
  assert.equal(hasRecipeOwnedOAuth(ranged, target, {}), false);
});

test('rejects a recipe-owned login wrapper unless it is allowlisted legacy', async (context) => {
  const repoRoot = await createRecipe(
    context,
    {
      scripts: { login: 'node scripts/login.mjs' },
      dependencies: { '@gleanwork/auth': '1.0.0' },
    },
    { 'scripts/login.mjs': 'export {};\n' },
  );

  assert.equal(hasRecipeOwnedOAuth(repoRoot, target, {}), false);
  assert.equal(
    oauthEntrypointKind(repoRoot, target, {
      helperTargets: {},
      wrapperTargets: {},
    }),
    undefined,
  );
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target, legacy), true);
  assert.equal(
    oauthEntrypointKind(repoRoot, target, {
      helperTargets: {},
      wrapperTargets: legacy,
    }),
    'legacy-wrapper',
  );
});

test('an allowlisted wrapper still needs its entry point to exist', async (context) => {
  const repoRoot = await createRecipe(context, {
    scripts: { login: 'tsx src/login.ts' },
  });
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target, legacy), false);
  await fs.outputFile(
    path.join(repoRoot, target, 'src/login.ts'),
    'export {};\n',
  );
  assert.equal(hasRecipeOwnedOAuth(repoRoot, target, legacy), true);
});

test('the copied helper is legacy only for allowlisted targets', async (context) => {
  const repoRoot = await createRecipe(
    context,
    { scripts: { login: 'node scripts/glean-auth.mjs login' } },
    { 'scripts/glean-auth.mjs': '#!/usr/bin/env node\n' },
  );

  assert.equal(hasRecipeOwnedOAuth(repoRoot, target, legacy), false);
  assert.equal(
    oauthEntrypointKind(repoRoot, target, {
      helperTargets: {},
      wrapperTargets: {},
    }),
    undefined,
  );
  assert.equal(
    oauthEntrypointKind(repoRoot, target, {
      helperTargets: legacy,
      wrapperTargets: {},
    }),
    'legacy-helper',
  );
});

test('finds login and configure scripts that invoke the copied helper', () => {
  assert.deepEqual(
    legacyHelperScripts({
      scripts: {
        login: 'glean-auth login --scopes chat',
        configure: 'node scripts/glean-auth.mjs configure',
        start: 'node scripts/glean-auth.mjs whoami',
      },
    }),
    [['configure', 'node scripts/glean-auth.mjs configure']],
  );
});
