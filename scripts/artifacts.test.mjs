import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import { compileArtifacts, materializeArtifacts } from './lib/artifacts.mjs';

test('one artifact definition can materialize identical standalone outputs', async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-'));
  t.after(() => fs.remove(repoRoot));
  const outputs = await compileArtifacts(
    [
      {
        id: 'shared-runtime',
        content: async () => 'shared\n',
        targets: async () => ['a/runtime.ts', 'b/runtime.ts'],
      },
    ],
    { repoRoot },
  );

  assert.equal((await materializeArtifacts(outputs)).length, 2);
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'a/runtime.ts'), 'utf8'),
    'shared\n',
  );
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'b/runtime.ts'), 'utf8'),
    'shared\n',
  );
  assert.equal(
    (await materializeArtifacts(outputs, { check: true })).length,
    0,
  );
});

test('check reports drift without changing the file', async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-'));
  t.after(() => fs.remove(repoRoot));
  await fs.outputFile(path.join(repoRoot, 'output.txt'), 'old\n');
  const outputs = await compileArtifacts(
    [
      {
        id: 'example',
        content: async () => 'new\n',
        targets: async () => ['output.txt'],
      },
    ],
    { repoRoot },
  );

  assert.equal(
    (await materializeArtifacts(outputs, { check: true })).length,
    1,
  );
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'output.txt'), 'utf8'),
    'old\n',
  );
});

test('duplicate artifact ownership fails before writing', async () => {
  await assert.rejects(
    compileArtifacts(
      [
        { id: 'one', content: async () => '1', targets: async () => ['x'] },
        { id: 'two', content: async () => '2', targets: async () => ['x'] },
      ],
      { repoRoot: '/tmp/artifacts' },
    ),
    /produced by both one and two/,
  );
});

async function oauthRepo(t, { helper = false, login } = {}) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'oauth-plan-'));
  t.after(() => fs.remove(repoRoot));
  const recipe = path.join(repoRoot, 'recipes/example');
  await fs.outputJson(path.join(recipe, 'recipe.json'), {
    id: 'example',
    codeAssets: [{ repoPath: 'recipes/example' }],
    execution: { auth: [{ kind: 'oauth-with-token-fallback' }] },
  });
  await fs.outputJson(path.join(recipe, 'package.json'), {
    scripts: { login },
    dependencies: { '@gleanwork/auth': '1.0.0' },
  });
  if (helper) {
    await fs.outputFile(path.join(recipe, 'scripts/glean-auth.mjs'), '//\n');
  }
  return repoRoot;
}

test('the legacy OAuth helper plan follows only the explicit allowlist', async (t) => {
  const { legacyOAuthHelperTargets } = await import('./artifacts.config.mjs');
  const allowlist = { 'recipes/example': 'legacy fixture' };

  const modern = await oauthRepo(t, {
    login: 'glean-auth login --scopes chat',
  });
  assert.deepEqual(
    await legacyOAuthHelperTargets({ repoRoot: modern }, {}),
    [],
  );

  const legacy = await oauthRepo(t, {
    helper: true,
    login: 'node scripts/glean-auth.mjs login',
  });
  assert.deepEqual(
    await legacyOAuthHelperTargets({ repoRoot: legacy }, allowlist),
    ['recipes/example/scripts/glean-auth.mjs'],
  );
  await assert.rejects(
    legacyOAuthHelperTargets({ repoRoot: legacy }, {}),
    /not on LEGACY_OAUTH_HELPER_TARGETS[\s\S]*not an allowlisted legacy target/,
  );

  await assert.rejects(
    legacyOAuthHelperTargets({ repoRoot: modern }, allowlist),
    /no longer ships scripts\/glean-auth\.mjs/,
  );

  const wrapper = await oauthRepo(t, { login: 'tsx src/login.ts' });
  await fs.outputFile(
    path.join(wrapper, 'recipes/example/src/login.ts'),
    'export {};\n',
  );
  await assert.rejects(
    legacyOAuthHelperTargets({ repoRoot: wrapper }, {}),
    /glean-auth login.*pinned @gleanwork\/auth/,
  );
});
