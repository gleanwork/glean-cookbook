import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import { recipeCodePatternViolations } from './lib/recipe-code-patterns.mjs';

const EMPTY = {
  'static-api-token': {},
  'env-file-parsing': {},
  'node-test-runner': {},
  'missing-vitest': {},
};

const MODERN_CLIENT = `import { Glean } from '@gleanwork/api-client';
import { createGleanTokenProvider } from '@gleanwork/auth';

export function createClient(serverUrl: string) {
  return new Glean({
    serverURL: serverUrl,
    apiToken:
      process.env.GLEAN_API_TOKEN?.trim() ||
      createGleanTokenProvider({ serverUrl, scopes: ['search'] }),
  });
}
`;

const MODERN_TEST = `import { afterAll, afterEach, beforeAll, test } from 'vitest';
import { setupServer } from 'msw/node';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
test('placeholder', () => {});
`;

function modernPackage() {
  return {
    'package.json': JSON.stringify({
      scripts: {
        login: 'glean-auth login --scopes search',
        test: 'vitest run',
      },
      dependencies: {
        '@gleanwork/api-client': '0.20.15',
        '@gleanwork/auth': '1.0.0',
      },
      devDependencies: { msw: '2.11.3', vitest: '5.0.0' },
    }),
    'tsconfig.json': '{}\n',
    'src/client.ts': MODERN_CLIENT,
    'src/client.test.ts': MODERN_TEST,
  };
}

async function fixture(t, files) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'code-patterns-'));
  t.after(() => fs.remove(repoRoot));
  for (const [file, contents] of Object.entries(files)) {
    await fs.outputFile(path.join(repoRoot, 'recipes/example', file), contents);
  }
  return repoRoot;
}

function rules(repoRoot, allowlists = EMPTY, helperTargets = {}) {
  return recipeCodePatternViolations({ repoRoot, allowlists, helperTargets })
    .map((violation) => violation.rule)
    .sort();
}

test('a modern TypeScript package passes every rule', async (t) => {
  const repoRoot = await fixture(t, modernPackage());
  assert.deepEqual(rules(repoRoot), []);
});

test('rejects the copied OAuth helper outside the allowlist', async (t) => {
  const repoRoot = await fixture(t, {
    ...modernPackage(),
    'scripts/glean-auth.mjs': '#!/usr/bin/env node\n',
  });
  assert.deepEqual(rules(repoRoot), ['oauth-helper']);
  assert.deepEqual(rules(repoRoot, EMPTY, { 'recipes/example': 'legacy' }), []);
});

test('rejects a static GLEAN_API_TOKEN without a token provider', async (t) => {
  const repoRoot = await fixture(t, {
    ...modernPackage(),
    'src/client.ts': `import { Glean } from '@gleanwork/api-client';
export const client = new Glean({ apiToken: process.env.GLEAN_API_TOKEN });
`,
  });
  assert.deepEqual(rules(repoRoot), ['static-api-token']);
});

test('rejects dotenv and hand-rolled .env parsing', async (t) => {
  const withDotenv = modernPackage();
  const packageJson = JSON.parse(withDotenv['package.json']);
  packageJson.dependencies.dotenv = '17.2.3';
  withDotenv['package.json'] = JSON.stringify(packageJson);
  assert.deepEqual(rules(await fixture(t, withDotenv)), ['env-file-parsing']);

  const handRolled = await fixture(t, {
    ...modernPackage(),
    'src/env.ts': `import fs from 'node:fs';
for (const line of fs.readFileSync('.env', 'utf8').split('\\n')) {
  const [key, value] = line.split('=');
  process.env[key] ??= value;
}
`,
  });
  assert.deepEqual(rules(handRolled), ['env-file-parsing']);
});

test('accepts node:process loadEnvFile for a genuine .env need', async (t) => {
  const repoRoot = await fixture(t, {
    ...modernPackage(),
    'src/env.ts': `import { loadEnvFile } from 'node:process';
try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
`,
  });
  assert.deepEqual(rules(repoRoot), []);
});

test('rejects node:test and a missing Vitest script in TypeScript packages', async (t) => {
  const files = modernPackage();
  const packageJson = JSON.parse(files['package.json']);
  packageJson.scripts.test = 'node --import tsx --test "src/**/*.test.ts"';
  delete packageJson.devDependencies.vitest;
  files['package.json'] = JSON.stringify(packageJson);
  files['src/client.test.ts'] =
    "import test from 'node:test';\ntest('x', () => {});\n";
  assert.deepEqual(rules(await fixture(t, files)), [
    'missing-vitest',
    'node-test-runner',
  ]);

  const importOnly = modernPackage();
  importOnly['src/client.test.ts'] =
    "import test from 'node:test';\ntest('x', () => {});\n";
  assert.deepEqual(rules(await fixture(t, importOnly)), ['node-test-runner']);
});

test('allowlisted directories pass, and a stale entry fails', async (t) => {
  const files = modernPackage();
  files['src/client.ts'] = `import { Glean } from '@gleanwork/api-client';
export const client = new Glean({ apiToken: process.env.GLEAN_API_TOKEN });
`;
  const repoRoot = await fixture(t, files);
  const allowlisted = {
    ...EMPTY,
    'static-api-token': { 'recipes/example': 'legacy' },
  };
  assert.deepEqual(rules(repoRoot, allowlisted), []);

  const modern = await fixture(t, modernPackage());
  const stale = recipeCodePatternViolations({
    repoRoot: modern,
    allowlists: allowlisted,
    helperTargets: {},
  });
  assert.equal(stale.length, 1);
  assert.match(stale[0].message, /remove it from LEGACY_CODE_PATTERN_TARGETS/);
});

test('JavaScript packages are not held to the TypeScript test rules', async (t) => {
  const repoRoot = await fixture(t, {
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'scripts/run.mjs': 'console.log("ok");\n',
  });
  assert.deepEqual(rules(repoRoot), []);
});
