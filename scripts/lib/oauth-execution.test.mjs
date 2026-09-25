import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import {
  legacyHelperScriptErrors,
  oauthAuthErrors,
} from './oauth-execution.mjs';

const target = 'recipes/example';
const none = { helperTargets: {}, wrapperTargets: {}, envConfigTargets: {} };
const modernAuth = {
  kind: 'oauth-with-token-fallback',
  scopes: ['search'],
  setupCommand: 'cd example && npm run login -- --email "<work-email>"',
  credentialVariable: 'GLEAN_API_TOKEN',
};

async function repo(t, packageJson, files = {}) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'oauth-exec-'));
  t.after(() => fs.remove(repoRoot));
  await fs.outputJson(path.join(repoRoot, target, 'package.json'), packageJson);
  for (const [file, contents] of Object.entries(files)) {
    await fs.outputFile(path.join(repoRoot, target, file), contents);
  }
  return repoRoot;
}

const officialPackage = {
  scripts: { login: 'glean-auth login --scopes search' },
  dependencies: { '@gleanwork/auth': '1.0.0' },
};

test('accepts the modern npm run login contract', async (t) => {
  const repoRoot = await repo(t, officialPackage);
  assert.deepEqual(
    oauthAuthErrors({ repoRoot, target, auth: modernAuth, allowlists: none }),
    [],
  );
  assert.deepEqual(
    oauthAuthErrors({
      repoRoot,
      target,
      auth: { ...modernAuth, setupCommand: 'npm run login -- --email "x"' },
      allowlists: none,
    }),
    [],
  );
});

test('rejects the copied helper as setup outside the allowlist', async (t) => {
  const repoRoot = await repo(t, officialPackage);
  const [error] = oauthAuthErrors({
    repoRoot,
    target,
    auth: {
      ...modernAuth,
      setupCommand: 'cd example && node scripts/glean-auth.mjs login',
    },
    allowlists: none,
  });
  assert.match(error, /setupCommand must be `npm run login`/);
});

test('rejects the legacy .env contract outside its allowlist', async (t) => {
  const repoRoot = await repo(t, officialPackage);
  const auth = {
    ...modernAuth,
    configFile: '.env',
    backendVariable: 'GLEAN_SERVER_URL',
  };
  const [error] = oauthAuthErrors({ repoRoot, target, auth, allowlists: none });
  assert.match(error, /legacy \.env contract/);
  assert.deepEqual(
    oauthAuthErrors({
      repoRoot,
      target,
      auth,
      allowlists: { ...none, envConfigTargets: { [target]: 'legacy' } },
    }),
    [],
  );
});

test('rejects a target without the official login unless allowlisted', async (t) => {
  const repoRoot = await repo(
    t,
    { scripts: { login: 'node scripts/glean-auth.mjs login' } },
    { 'scripts/glean-auth.mjs': '//\n' },
  );
  const [error] = oauthAuthErrors({
    repoRoot,
    target,
    auth: modernAuth,
    allowlists: none,
  });
  assert.match(error, /glean-auth login.*pinned @gleanwork\/auth/);
  assert.deepEqual(
    oauthAuthErrors({
      repoRoot,
      target,
      auth: {
        ...modernAuth,
        configFile: '.env',
        backendVariable: 'GLEAN_SERVER_URL',
      },
      allowlists: { ...none, helperTargets: { [target]: 'legacy' } },
    }),
    [],
  );
});

test('flags login/configure scripts calling the helper regardless of auth kind', async (t) => {
  const repoRoot = await repo(t, {
    scripts: { configure: 'node scripts/glean-auth.mjs configure' },
  });
  const [error] = legacyHelperScriptErrors({ repoRoot, helperTargets: {} });
  assert.match(error, /`configure` runs the legacy copied helper/);
  assert.deepEqual(
    legacyHelperScriptErrors({
      repoRoot,
      helperTargets: { [target]: 'legacy' },
    }),
    [],
  );
});
