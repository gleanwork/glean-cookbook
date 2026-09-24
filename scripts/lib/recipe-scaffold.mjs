import { spawn } from 'node:child_process';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fg from 'fast-glob';
import fs from 'fs-extra';

import { resolveFrameworkFeatureImplementations } from './framework-features.mjs';
import { readJsonc } from './jsonc.mjs';

const TODO_MARKER = 'GLEAN_RECIPE_SCAFFOLD_TODO';
const AUTH_RULE =
  'See "Official Glean authentication" and "Reference recipes" in CONTRIBUTING.md.';
// The reference recipes (validate-and-publish-skill,
// search-with-discovered-filters) pin these. Bump them together.
const OAUTH_DEPENDENCIES = {
  '@gleanwork/api-client': '0.20.15',
  '@gleanwork/auth': '1.0.0',
};
const TYPESCRIPT_DEV_DEPENDENCIES = {
  '@types/node': '22.20.1',
  eslint: '10.10.0',
  msw: '2.11.3',
  tsx: '4.23.13',
  typescript: '6.0.3',
  'typescript-eslint': '8.69.0',
  vitest: '5.0.0',
};
const MODERN_LOGIN_SETUP =
  /^(?:cd\s+(?:"[^"]+"|'[^']+'|[^\s&;|]+)\s*&&\s*)?npm run login(?:\s|$)/u;

function oauthAuth(draft) {
  return draft.execution.auth.find(
    (auth) => auth.kind === 'oauth-with-token-fallback',
  );
}

function fail(message) {
  throw new Error(`Recipe scaffold failed: ${message}`);
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderReadme(draft) {
  const prerequisites = draft.prerequisites
    .map((item) => `- ${item}`)
    .join('\n');
  const steps = draft.steps
    .map((step, index) => {
      const parts = [`${index + 1}. **${step.title}**`];
      if (step.description) parts.push(`\n   ${step.description}`);
      if (step.command) {
        parts.push(`\n   \`\`\`bash\n   ${step.command}\n   \`\`\``);
      }
      return parts.join('');
    })
    .join('\n\n');
  const authentication = oauthAuth(draft)
    ? `\n## Authentication\n\n\`npm run login -- --email <work-email>\` runs \`glean-auth login\` from the pinned \`@gleanwork/auth\` package. It discovers your Glean backend from your work email and stores refreshable credentials outside the project; it does not write \`.env\`. Pass \`--server-url\` (or set \`GLEAN_SERVER_URL\`) to target an explicit backend. For non-interactive runs, set \`GLEAN_API_TOKEN\` to a user-scoped token as a fallback.\n`
    : '';
  return `# ${draft.title}\n\n${draft.description}\n\n> **Draft:** \`${TODO_MARKER}\`. This scaffold contains no recipe-specific implementation yet. Implement and verify the documented workflow before making it visible.\n\n## Prerequisites\n\n${prerequisites}\n\n## Steps\n\n${steps}\n${authentication}`;
}

function typescriptClient(scopes) {
  return `import { Glean, type SDKOptions } from '@gleanwork/api-client';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

// Keep these identical to the \`login\` script in package.json.
export const SCOPES = ${JSON.stringify(scopes).replaceAll('"', "'")};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface GleanClientTarget {
  email?: string;
  serverUrl?: string;
}

async function resolveServerUrl({ email, serverUrl }: GleanClientTarget) {
  const explicit = serverUrl?.trim();
  if (explicit) return explicit;

  const workEmail = email?.trim();
  if (workEmail) return (await discoverGleanTenant(workEmail)).serverUrl;

  const configured = process.env.GLEAN_SERVER_URL?.trim();
  if (configured) return configured;

  throw new Error(
    'Pass --email or --server-url, or set GLEAN_SERVER_URL in your environment.',
  );
}

export async function createGleanClient(target: GleanClientTarget) {
  const server = new URL(await resolveServerUrl(target));
  const loopback = LOOPBACK_HOSTS.has(server.hostname);
  if (
    (server.protocol !== 'https:' && !loopback) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    (server.pathname && server.pathname !== '/') ||
    (!loopback && server.port)
  ) {
    throw new Error('Use a complete Glean backend HTTPS origin.');
  }

  // GLEAN_API_TOKEN is a non-interactive fallback. Otherwise the provider
  // reads and refreshes the credentials that \`npm run login\` stored.
  const options = {
    serverURL: server.origin,
    apiToken:
      process.env.GLEAN_API_TOKEN?.trim() ||
      createGleanTokenProvider({ serverUrl: server.origin, scopes: SCOPES }),
  } satisfies SDKOptions;

  return new Glean(options);
}
`;
}

const TYPESCRIPT_CLIENT_TEST = `import assert from 'node:assert/strict';
import { Glean } from '@gleanwork/api-client';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, test } from 'vitest';

import { createGleanClient } from './client.js';

const originalApiToken = process.env.GLEAN_API_TOKEN;
const originalServerUrl = process.env.GLEAN_SERVER_URL;
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  if (originalApiToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalApiToken;
  if (originalServerUrl === undefined) delete process.env.GLEAN_SERVER_URL;
  else process.env.GLEAN_SERVER_URL = originalServerUrl;
});

afterAll(() => {
  server.close();
});

// Exercises the real SDK over HTTP. Replace the search call with the Glean
// API your workflow uses, and add tests for the workflow itself.
test('discovers the backend from work email and sends the fallback token', async () => {
  const authorizations: Array<string | null> = [];
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  process.env.GLEAN_SERVER_URL = 'https://wrong-tenant.example.com';
  server.use(
    http.post('https://app.glean.com/config/search', () =>
      HttpResponse.json({
        search_config: { queryURL: 'https://example-be.glean.com' },
      }),
    ),
    http.post('https://example-be.glean.com/api/search', ({ request }) => {
      authorizations.push(request.headers.get('authorization'));
      return HttpResponse.json({
        request_id: 'fixture-request',
        results: [],
        has_more: false,
        next_cursor: null,
        warnings: [],
      });
    }),
  );

  const client = await createGleanClient({ email: 'person@example.com' });
  assert.ok(client instanceof Glean);
  await client.search.query({ query: 'policy' });
  assert.deepEqual(authorizations, ['Bearer fixture-token']);
});

test('rejects a backend that is not an HTTPS origin', async () => {
  await assert.rejects(
    createGleanClient({ serverUrl: 'http://example-be.glean.com' }),
    /complete Glean backend HTTPS origin/,
  );
});
`;

const TYPESCRIPT_ESLINT_CONFIG = `import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['eslint.config.mjs'] },
  tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
);
`;

function typescriptFiles(draft, dependencies) {
  const oauth = oauthAuth(draft);
  const scripts = {
    ...(oauth
      ? { login: `glean-auth login --scopes ${oauth.scopes.join(',')}` }
      : {}),
    start: 'tsx src/main.ts',
    // Without OAuth there is no generated client to test yet; add tests
    // for the workflow alongside src/main.ts.
    test: oauth ? 'vitest run' : 'vitest run --passWithNoTests',
    lint: 'eslint src',
    typecheck: 'tsc --noEmit',
    'test:all': 'npm run test && npm run lint && npm run typecheck',
  };
  return [
    { path: '.gitignore', content: 'node_modules/\ndist/\n' },
    {
      path: 'package.json',
      content: json({
        name: draft.id,
        version: '0.0.0',
        private: true,
        description: draft.description,
        type: 'module',
        scripts,
        dependencies,
        devDependencies: TYPESCRIPT_DEV_DEPENDENCIES,
        allowScripts: {
          'esbuild@0.28.2': true,
          fsevents: false,
          'msw@2.11.3': true,
        },
        engines: { node: '>=22.12.0' },
      }),
    },
    {
      path: 'tsconfig.json',
      content: json({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          types: ['node'],
          strict: true,
          noUncheckedIndexedAccess: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['src'],
      }),
    },
    { path: 'eslint.config.mjs', content: TYPESCRIPT_ESLINT_CONFIG },
    ...(oauth
      ? [
          { path: 'src/client.ts', content: typescriptClient(oauth.scopes) },
          { path: 'src/client.test.ts', content: TYPESCRIPT_CLIENT_TEST },
        ]
      : []),
    {
      path: 'src/main.ts',
      content: `// ${TODO_MARKER}\n//\n// Implement the recipe-specific workflow here, following the reference\n// recipes named in CONTRIBUTING.md.${oauth ? ' Create the SDK client with\n// createGleanClient() from ./client.js.' : ''}\n\nthrow new Error(\n  'Implement the recipe-specific workflow before running this scaffold.',\n);\n`,
    },
  ];
}

function pythonFiles(dependencies) {
  const dependencyLines = Object.entries(dependencies)
    .map(([name, version]) => `#   "${name}==${version}",`)
    .join('\n');
  return [
    {
      path: 'main.py',
      content: `# /// script\n# requires-python = ">=3.11"\n# dependencies = [\n${dependencyLines}\n# ]\n# ///\n\n# ${TODO_MARKER}\n\n\ndef main() -> None:\n    raise NotImplementedError(\n        "Implement the recipe-specific workflow before running this scaffold."\n    )\n\n\nif __name__ == "__main__":\n    main()\n`,
    },
  ];
}

function mergeDependencies(implementations) {
  const dependencies = new Map();
  for (const implementation of implementations) {
    for (const [name, version] of Object.entries(implementation.dependencies)) {
      const previous = dependencies.get(name);
      if (previous && previous !== version) {
        fail(
          `selected features require conflicting versions of ${name}: ${previous} and ${version}`,
        );
      }
      dependencies.set(name, version);
    }
  }
  return Object.fromEntries([...dependencies.entries()].sort());
}

async function validateDraft(repoRoot, draft) {
  const schema = await fs.readJson(
    path.join(repoRoot, 'schemas', 'recipe.schema.json'),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(draft)) {
    const errors = (validate.errors ?? [])
      .map((error) => `${error.instancePath || '(root)'} ${error.message}`)
      .join('; ');
    fail(`draft fails schemas/recipe.schema.json: ${errors}`);
  }
  if (draft.hidden !== true) fail('draft must set hidden to true');
  if (draft.buildMethod !== 'scaffold') {
    fail('draft must use buildMethod scaffold');
  }
  if ('lastVerified' in draft) {
    fail(
      'lastVerified must be added only after the completed recipe is verified',
    );
  }
  const assets = draft.codeAssets ?? [];
  if (assets.length !== 1) {
    fail('the first version supports exactly one code asset');
  }
  const asset = assets[0];
  if (!['python', 'typescript'].includes(asset.language)) {
    fail('the first version supports only Python and TypeScript');
  }
  const expectedRepoPath = `recipes/${draft.id}`;
  if (asset.repoPath !== expectedRepoPath) {
    fail(`codeAssets[0].repoPath must be ${expectedRepoPath}`);
  }
  if (draft.execution?.type !== 'cli' || asset.execution) {
    fail('the first version supports only one recipe-level CLI execution');
  }
  const runIndex = draft.steps?.findIndex((step) => step.kind === 'run');
  const runStep = runIndex === undefined ? undefined : draft.steps[runIndex];
  if (!runStep?.command) fail('CLI steps must include a run command');
  if (draft.execution.run.command !== runStep.command) {
    fail('execution.run.command must match the run step command');
  }
  let workingDirectory = '.';
  for (const step of draft.steps.slice(0, runIndex)) {
    const command = step.command?.trim() ?? '';
    if (command.startsWith('(')) continue;
    const change = command.match(
      /^cd\s+("[^"]+"|'[^']+'|[^\s&;]+)(?:\s*&&|\s*$)/u,
    );
    if (!change) continue;
    const target = change[1].replace(/^(?:"([^"]+)"|'([^']+)')$/u, '$1$2');
    workingDirectory = path.posix.normalize(
      path.posix.join(workingDirectory, target),
    );
  }
  const escapedId = draft.id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const entryPoint =
    asset.language === 'typescript' ? 'npm start' : 'uv run main\\.py';
  let runPattern;
  if (workingDirectory === draft.id) {
    runPattern = new RegExp(`^${entryPoint}(?:\\s|$)`, 'u');
  } else if (workingDirectory === '.') {
    runPattern = new RegExp(`^cd ${escapedId} && ${entryPoint}(?:\\s|$)`, 'u');
  } else {
    fail(
      `steps leave the shell in ${workingDirectory}; the run step must start from the recipe root`,
    );
  }
  if (!runPattern.test(runStep.command)) {
    fail(
      `${asset.language} run command must use the generated entry point from the documented working directory`,
    );
  }
  const oauth = oauthAuth(draft);
  if (oauth) validateOAuth(asset, oauth);
  for (const field of ['preview', 'codeWalkthrough', 'pastePromptFile']) {
    if (draft[field]) {
      fail(
        `${field} references authored files and must be added after scaffolding`,
      );
    }
  }
  return asset;
}

function validateOAuth(asset, oauth) {
  if (asset.language === 'python') {
    fail(
      `Python OAuth scaffolds are not supported: there is no supported Python OAuth package path yet. Use a token-only auth kind, or scaffold a TypeScript recipe. ${AUTH_RULE}`,
    );
  }
  const setup = oauth.setupCommand?.trim() ?? '';
  if (setup.includes('glean-auth.mjs')) {
    fail(
      `OAuth setupCommand must not run the legacy copied scripts/glean-auth.mjs helper; use \`npm run login -- --email "<work-email>"\`. ${AUTH_RULE}`,
    );
  }
  if (!MODERN_LOGIN_SETUP.test(setup)) {
    fail(
      `OAuth setupCommand must be \`npm run login -- --email "<work-email>"\` (optionally after \`cd <dir> &&\`). ${AUTH_RULE}`,
    );
  }
  for (const field of ['configFile', 'backendVariable']) {
    if (field in oauth) {
      fail(
        `OAuth auth must not declare ${field}: @gleanwork/auth stores credentials outside the project and never writes .env. ${AUTH_RULE}`,
      );
    }
  }
  if (oauth.credentialVariable !== 'GLEAN_API_TOKEN') {
    fail(
      `OAuth auth must declare credentialVariable GLEAN_API_TOKEN as the non-interactive fallback. ${AUTH_RULE}`,
    );
  }
  if (!oauth.scopes?.length) {
    fail(`OAuth auth must declare the scopes the recipe needs. ${AUTH_RULE}`);
  }
}

export async function planRecipeScaffold({ repoRoot, draft }) {
  repoRoot = path.resolve(repoRoot);
  const asset = await validateDraft(repoRoot, draft);
  const relativeDirectory = `recipes/${draft.id}`;
  const directory = path.join(repoRoot, ...relativeDirectory.split('/'));
  if (await fs.pathExists(directory)) {
    fail(`${relativeDirectory} already exists`);
  }

  const implementations = await resolveFrameworkFeatureImplementations({
    repoRoot,
    featureIds: asset.frameworkFeatures ?? [],
    language: asset.language,
  });
  const expectedManifest =
    asset.language === 'typescript' ? 'package.json' : 'main.py';
  for (const implementation of implementations) {
    if (implementation.consumerManifest !== expectedManifest) {
      fail(
        `${implementation.featureId}/${asset.language} requires unsupported consumer manifest ${implementation.consumerManifest}`,
      );
    }
  }

  const dependencies = mergeDependencies([
    ...implementations,
    ...(oauthAuth(draft) ? [{ dependencies: OAUTH_DEPENDENCIES }] : []),
  ]);
  const generatedTargets = implementations
    .map((implementation) => implementation.target)
    .sort();
  if (
    new Set(generatedTargets.map((target) => target.toLowerCase())).size !==
    generatedTargets.length
  ) {
    fail('selected infrastructure generates colliding target paths');
  }
  const files = [
    { path: 'recipe.json', content: json(draft) },
    { path: 'README.md', content: renderReadme(draft) },
    ...(asset.language === 'typescript'
      ? typescriptFiles(draft, dependencies)
      : pythonFiles(dependencies)),
  ];
  const plannedPaths = new Set(files.map((entry) => entry.path.toLowerCase()));
  for (const target of generatedTargets) {
    if (plannedPaths.has(target.toLowerCase())) {
      fail(`framework target ${target} collides with a scaffold-owned file`);
    }
  }

  return {
    id: draft.id,
    language: asset.language,
    relativeDirectory,
    directory,
    files,
    generatedTargets,
    lockCommand:
      asset.language === 'typescript'
        ? {
            // npm 10 (bundled with the pinned Node 22.16.0) crashes with
            // "Cannot read properties of null (reading 'edgesOut')" when it
            // resolves the vitest/vite peer set without a lock. Installing
            // from the resulting lock works on npm 10, so only lock creation
            // uses a pinned npm 11.
            command: 'npx',
            args: [
              '-y',
              'npm@11.20.0',
              'install',
              '--package-lock-only',
              '--ignore-scripts',
            ],
          }
        : { command: 'uv', args: ['lock', '--script', 'main.py'] },
  };
}

function defaultRun(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
          ),
        );
      }
    });
  });
}

export async function createRecipeScaffold({
  repoRoot,
  draftFile,
  dryRun = false,
  run = defaultRun,
}) {
  repoRoot = path.resolve(repoRoot);
  const draft = readJsonc(path.resolve(draftFile));
  const plan = await planRecipeScaffold({ repoRoot, draft });
  if (dryRun) return plan;

  const staging = path.join(
    repoRoot,
    'recipes',
    `.${plan.id}.scaffold-${process.pid}-${Date.now()}`,
  );
  const registry = path.join(repoRoot, 'registry.json');
  const previousRegistry = await fs.readFile(registry).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  let moved = false;
  try {
    await run(process.execPath, ['scripts/build-artifacts.mjs', '--check'], {
      cwd: repoRoot,
    });
    await run(process.execPath, ['scripts/build-registry.mjs', '--check'], {
      cwd: repoRoot,
    });
    for (const entry of plan.files) {
      const target = path.join(staging, ...entry.path.split('/'));
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, entry.content);
    }
    await run(plan.lockCommand.command, plan.lockCommand.args, {
      cwd: staging,
    });
    await fs.move(staging, plan.directory);
    moved = true;
    await run(process.execPath, ['scripts/build-artifacts.mjs'], {
      cwd: repoRoot,
    });
    await run(process.execPath, ['scripts/build-registry.mjs'], {
      cwd: repoRoot,
    });
    return plan;
  } catch (error) {
    await fs.remove(staging);
    if (moved) await fs.remove(plan.directory);
    if (previousRegistry === undefined) await fs.remove(registry);
    else await fs.writeFile(registry, previousRegistry);
    throw error;
  }
}

export async function scaffoldReadinessErrors({ repoRoot }) {
  repoRoot = path.resolve(repoRoot);
  const errors = [];
  const recipeFiles = await fg('recipes/*/recipe.json', {
    cwd: repoRoot,
    absolute: true,
  });
  for (const recipeFile of recipeFiles.sort()) {
    const recipe = readJsonc(recipeFile);
    if (recipe.hidden === true) continue;
    const recipeRoot = path.dirname(recipeFile);
    const authoredFiles = await fg('**/*.{md,py,js,mjs,cjs,ts,tsx,mts,cts}', {
      cwd: recipeRoot,
      absolute: true,
      followSymbolicLinks: false,
      ignore: ['**/node_modules/**', '**/.venv/**', '**/dist/**'],
    });
    for (const authoredFile of authoredFiles.sort()) {
      if ((await fs.readFile(authoredFile, 'utf8')).includes(TODO_MARKER)) {
        errors.push(
          `${recipe.id}: remove ${TODO_MARKER} from ${path.relative(repoRoot, authoredFile).split(path.sep).join('/')} before making the recipe visible`,
        );
      }
    }
  }
  return errors;
}
