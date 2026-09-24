import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createRecipeScaffold,
  planRecipeScaffold,
  scaffoldReadinessErrors,
} from './recipe-scaffold.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function draft(id, language = 'typescript') {
  const runCommand =
    language === 'typescript'
      ? `cd ${id} && npm start`
      : `cd ${id} && uv run main.py`;
  return {
    id,
    title: 'Summarize an incident',
    description:
      'Summarize an incident from content the signed-in user can access.',
    surfaces: ['platform-api'],
    capabilities: ['chat'],
    status: 'quickstart',
    category: 'search',
    level: 'Beginner',
    levels: { minimal: true, wow: false },
    timeEstimate: '~20 min',
    icon: 'message-with-sparkles',
    requiredScopes: ['CHAT'],
    authMethod: ['client-api-oauth-or-token'],
    buildMethod: 'scaffold',
    prerequisites: ['A Glean instance with incident content'],
    demoQueries: [
      {
        query: 'Summarize incident 123.',
        expectedBehavior:
          'Returns a grounded summary when the user can access the incident.',
      },
    ],
    codeAssets: [
      {
        repoPath: `recipes/${id}`,
        language,
        description: `${language} CLI`,
        frameworkFeatures: ['terminal-markdown'],
      },
    ],
    steps: [
      {
        title: 'Scaffold the project',
        command: `npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/${id} ${id}`,
        kind: 'scaffold',
      },
      { title: 'Run it', command: runCommand, kind: 'run' },
    ],
    execution: {
      type: 'cli',
      auth: [{ kind: 'none' }],
      verification: {
        kind: 'manual',
        expectedDuration: 'about 1 minute',
        startsOwnServer: false,
      },
      run: { command: runCommand, userBrowser: false },
    },
    content: {
      problem:
        'Incident summaries should stay grounded in content the user can access.',
      takeItFurther: [],
    },
    aiPrompt:
      'Implement the authored incident-summary recipe and verify its documented outcome.',
    hidden: true,
  };
}

function file(plan, relativePath) {
  return plan.files.find((entry) => entry.path === relativePath)?.content;
}

async function fixtureRepo(t, id) {
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), 'recipe-scaffold-repo-'),
  );
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  await fs.mkdir(path.join(temp, 'schemas'), { recursive: true });
  await fs.mkdir(path.join(temp, 'framework'), { recursive: true });
  await fs.mkdir(path.join(temp, 'recipes'), { recursive: true });
  await fs.copyFile(
    path.join(repoRoot, 'schemas', 'recipe.schema.json'),
    path.join(temp, 'schemas', 'recipe.schema.json'),
  );
  await fs.cp(
    path.join(repoRoot, 'framework', 'terminal-markdown'),
    path.join(temp, 'framework', 'terminal-markdown'),
    { recursive: true },
  );
  await fs.writeFile(path.join(temp, 'registry.json'), '[]\n');
  const draftFile = path.join(temp, 'draft.json');
  await fs.writeFile(draftFile, JSON.stringify(draft(id)));
  return { repoRoot: temp, draftFile };
}

test('plans a standalone TypeScript CLI from framework metadata', async () => {
  const plan = await planRecipeScaffold({
    repoRoot,
    draft: draft('scaffold-typescript-contract'),
  });

  assert.equal(plan.language, 'typescript');
  assert.equal(plan.relativeDirectory, 'recipes/scaffold-typescript-contract');
  assert.deepEqual(plan.generatedTargets, ['src/output.ts']);
  assert.deepEqual(plan.lockCommand, {
    command: 'npx',
    args: [
      '-y',
      'npm@11.20.0',
      'install',
      '--package-lock-only',
      '--ignore-scripts',
    ],
  });

  const packageJson = JSON.parse(file(plan, 'package.json'));
  assert.deepEqual(packageJson.dependencies, {
    marked: '15.0.12',
    'marked-terminal': '7.3.0',
    'strip-ansi': '7.2.0',
  });
  assert.equal(packageJson.scripts.check, undefined);
  assert.equal(packageJson.scripts.test, 'vitest run --passWithNoTests');
  assert.equal(packageJson.scripts.lint, 'eslint src');
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
  assert.equal(packageJson.scripts.login, undefined);
  assert.equal(packageJson.devDependencies.vitest, '5.0.0');
  assert.equal(packageJson.allowScripts['msw@2.11.3'], true);
  assert.equal(file(plan, 'src/client.ts'), undefined);
  assert.equal(file(plan, '.env.example'), undefined);
  assert.deepEqual(
    JSON.parse(file(plan, 'tsconfig.json')).compilerOptions.types,
    ['node'],
  );
  assert.match(file(plan, 'README.md'), /Summarize an incident/);
  assert.match(
    file(plan, 'README.md'),
    /cd scaffold-typescript-contract && npm start/,
  );
  assert.match(file(plan, 'src/main.ts'), /GLEAN_RECIPE_SCAFFOLD_TODO/);
});

test('plans a locked Python script from framework metadata', async () => {
  const plan = await planRecipeScaffold({
    repoRoot,
    draft: draft('scaffold-python-contract', 'python'),
  });

  assert.equal(plan.language, 'python');
  assert.deepEqual(plan.generatedTargets, ['markdown_output.py']);
  assert.deepEqual(plan.lockCommand, {
    command: 'uv',
    args: ['lock', '--script', 'main.py'],
  });
  assert.match(file(plan, 'main.py'), /"rich==15\.0\.0"/);
  assert.match(file(plan, 'main.py'), /GLEAN_RECIPE_SCAFFOLD_TODO/);
});

test('requires a hidden, single-asset CLI draft', async () => {
  const visible = draft('scaffold-visible-contract');
  visible.hidden = false;
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: visible }),
    /must set hidden to true/,
  );

  const web = draft('scaffold-web-contract');
  web.execution.type = 'local-web';
  web.execution.run = {
    command: 'npm start',
    url: 'http://localhost',
    userBrowser: true,
  };
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: web }),
    /recipe-level CLI execution/,
  );

  const multiple = draft('scaffold-multiple-contract');
  multiple.codeAssets.push({ ...multiple.codeAssets[0] });
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: multiple }),
    /exactly one code asset/,
  );

  const missing = draft('scaffold-missing-contract');
  delete missing.codeAssets;
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: missing }),
    /exactly one code asset/,
  );

  const integrate = draft('scaffold-integrate-contract');
  integrate.buildMethod = 'integrate';
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: integrate }),
    /must use buildMethod scaffold/,
  );

  const verified = draft('scaffold-verified-contract');
  verified.lastVerified = '2026-09-22';
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: verified }),
    /lastVerified must be added only after/,
  );

  const wrongEntryPoint = draft('scaffold-entrypoint-contract');
  wrongEntryPoint.steps[1].command =
    'cd scaffold-entrypoint-contract && node another-script.js';
  wrongEntryPoint.execution.run.command = wrongEntryPoint.steps[1].command;
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: wrongEntryPoint }),
    /run command must use the generated entry point/,
  );

  const sequential = draft('scaffold-sequential-contract');
  sequential.steps.splice(1, 0, {
    title: 'Install dependencies',
    command: 'cd scaffold-sequential-contract && npm install',
    kind: 'install',
  });
  sequential.steps[2].command = 'npm start';
  sequential.execution.run.command = 'npm start';
  await planRecipeScaffold({ repoRoot, draft: sequential });

  const standaloneCd = draft('scaffold-standalone-cd-contract');
  standaloneCd.steps.splice(1, 0, {
    title: 'Enter the project',
    command: 'cd scaffold-standalone-cd-contract',
    kind: 'manual',
  });
  standaloneCd.steps[2].command = 'npm start';
  standaloneCd.execution.run.command = 'npm start';
  await planRecipeScaffold({ repoRoot, draft: standaloneCd });

  const subdirectory = draft('scaffold-subdirectory-contract');
  subdirectory.steps.splice(1, 0, {
    title: 'Enter a source directory',
    command: 'cd scaffold-subdirectory-contract/src && pwd',
    kind: 'manual',
  });
  subdirectory.steps[2].command = 'npm start';
  subdirectory.execution.run.command = 'npm start';
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: subdirectory }),
    /steps leave the shell in scaffold-subdirectory-contract\/src/,
  );

  const repeatedCd = structuredClone(sequential);
  repeatedCd.id = 'scaffold-repeated-cd-contract';
  repeatedCd.codeAssets[0].repoPath = 'recipes/scaffold-repeated-cd-contract';
  repeatedCd.steps[0].command =
    'npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/scaffold-repeated-cd-contract scaffold-repeated-cd-contract';
  repeatedCd.steps[1].command =
    'cd scaffold-repeated-cd-contract && npm install';
  repeatedCd.steps[2].command = 'cd scaffold-repeated-cd-contract && npm start';
  repeatedCd.execution.run.command = repeatedCd.steps[2].command;
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: repeatedCd }),
    /run command must use the generated entry point/,
  );
});

test('refuses an existing or mismatched recipe directory', async () => {
  const existing = draft('a2a-client', 'python');
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: existing }),
    /already exists/,
  );

  const mismatched = draft('scaffold-path-contract');
  mismatched.codeAssets[0].repoPath = 'recipes/another-id';
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: mismatched }),
    /repoPath must be recipes\/scaffold-path-contract/,
  );
});

function modernOAuth(id) {
  return {
    kind: 'oauth-with-token-fallback',
    scopes: ['chat'],
    setupCommand: `cd ${id} && npm run login -- --email "<work-email>"`,
    credentialVariable: 'GLEAN_API_TOKEN',
  };
}

test('rejects legacy OAuth draft contracts with a pointer to CONTRIBUTING', async () => {
  const id = 'scaffold-legacy-oauth-contract';
  const cases = [
    [
      {
        setupCommand: `cd ${id} && node scripts/glean-auth.mjs login --scopes chat`,
      },
      /must not run the legacy copied scripts\/glean-auth\.mjs helper/,
    ],
    [
      { setupCommand: `cd ${id} && tsx src/login.ts` },
      /must be `npm run login/,
    ],
    [{ configFile: '.env' }, /must not declare configFile/],
    [
      { backendVariable: 'GLEAN_SERVER_URL' },
      /must not declare backendVariable/,
    ],
    [
      { credentialVariable: 'GLEAN_TOKEN' },
      /credentialVariable GLEAN_API_TOKEN/,
    ],
    [{ scopes: [] }, /must declare the scopes/],
  ];
  for (const [override, message] of cases) {
    const legacy = draft(id);
    legacy.execution.auth = [{ ...modernOAuth(id), ...override }];
    await assert.rejects(
      planRecipeScaffold({ repoRoot, draft: legacy }),
      (error) => {
        assert.match(error.message, message);
        assert.match(error.message, /CONTRIBUTING\.md/);
        return true;
      },
    );
  }
});

test('refuses Python OAuth drafts instead of emitting the Node helper', async () => {
  const id = 'scaffold-python-oauth-contract';
  const python = draft(id, 'python');
  python.execution.auth = [modernOAuth(id)];
  await assert.rejects(
    planRecipeScaffold({ repoRoot, draft: python }),
    /no supported Python OAuth package path/,
  );
});

test('dry-run returns the complete plan without writing or running commands', async (t) => {
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), 'recipe-scaffold-dry-run-'),
  );
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const input = path.join(temp, 'recipe.json');
  const oauthDraft = draft('scaffold-dry-run-contract');
  oauthDraft.execution.auth = [modernOAuth('scaffold-dry-run-contract')];
  await fs.writeFile(input, JSON.stringify(oauthDraft));
  let commandRuns = 0;

  const plan = await createRecipeScaffold({
    repoRoot,
    draftFile: input,
    dryRun: true,
    run: async () => {
      commandRuns += 1;
    },
  });

  assert.equal(commandRuns, 0);
  await assert.rejects(
    fs.access(path.join(repoRoot, 'recipes/scaffold-dry-run-contract')),
  );
  assert.deepEqual(plan.generatedTargets, ['src/output.ts']);
  assert.ok(!plan.files.some((entry) => entry.path.includes('glean-auth.mjs')));
  assert.equal(file(plan, '.env.example'), undefined);
  assert.doesNotMatch(file(plan, '.gitignore'), /\.env/);

  const packageJson = JSON.parse(file(plan, 'package.json'));
  assert.equal(packageJson.scripts.login, 'glean-auth login --scopes chat');
  assert.equal(packageJson.scripts.test, 'vitest run');
  assert.equal(packageJson.dependencies['@gleanwork/auth'], '1.0.0');
  assert.equal(packageJson.dependencies['@gleanwork/api-client'], '0.20.15');
  assert.equal(packageJson.dependencies.dotenv, undefined);

  const client = file(plan, 'src/client.ts');
  assert.match(client, /export const SCOPES = \['chat'\];/);
  assert.match(client, /discoverGleanTenant\(workEmail\)/);
  assert.match(
    client,
    /process\.env\.GLEAN_API_TOKEN\?\.trim\(\) \|\|\s+createGleanTokenProvider/,
  );
  assert.doesNotMatch(client, /readFile|dotenv/);
  const clientTest = file(plan, 'src/client.test.ts');
  assert.match(clientTest, /onUnhandledRequest: 'error'/);
  assert.match(clientTest, /server\.resetHandlers\(\)/);
  assert.match(clientTest, /server\.close\(\)/);
  assert.doesNotMatch(clientTest, /globalThis\.fetch|node:test/);
  assert.match(file(plan, 'src/main.ts'), /GLEAN_RECIPE_SCAFFOLD_TODO/);
  assert.match(file(plan, 'README.md'), /GLEAN_API_TOKEN.*fallback/);
});

test('applies a scaffold only after clean generated-output preflights', async (t) => {
  const id = 'scaffold-apply-contract';
  const fixture = await fixtureRepo(t, id);
  const calls = [];
  const run = async (command, args, { cwd }) => {
    calls.push({ command, args, cwd });
    if (command === 'npx') {
      await fs.writeFile(path.join(cwd, 'package-lock.json'), '{}\n');
    } else if (
      args[0] === 'scripts/build-artifacts.mjs' &&
      !args.includes('--check')
    ) {
      const target = path.join(
        fixture.repoRoot,
        'recipes',
        id,
        'src',
        'output.ts',
      );
      await fs.copyFile(
        path.join(
          fixture.repoRoot,
          'framework',
          'terminal-markdown',
          'markdown_output.ts',
        ),
        target,
      );
    } else if (
      args[0] === 'scripts/build-registry.mjs' &&
      !args.includes('--check')
    ) {
      await fs.writeFile(
        path.join(fixture.repoRoot, 'registry.json'),
        '[{"id":"scaffold-apply-contract"}]\n',
      );
    }
  };

  await createRecipeScaffold({ ...fixture, run });

  assert.deepEqual(
    calls.map(({ command, args }) => [path.basename(command), ...args]),
    [
      ['node', 'scripts/build-artifacts.mjs', '--check'],
      ['node', 'scripts/build-registry.mjs', '--check'],
      [
        'npx',
        '-y',
        'npm@11.20.0',
        'install',
        '--package-lock-only',
        '--ignore-scripts',
      ],
      ['node', 'scripts/build-artifacts.mjs'],
      ['node', 'scripts/build-registry.mjs'],
    ],
  );
  await fs.access(
    path.join(fixture.repoRoot, 'recipes', id, 'package-lock.json'),
  );
  await fs.access(
    path.join(fixture.repoRoot, 'recipes', id, 'src', 'output.ts'),
  );
});

test('rolls back the new directory and registry when generation fails', async (t) => {
  const id = 'scaffold-rollback-contract';
  const fixture = await fixtureRepo(t, id);
  const run = async (command, args, { cwd }) => {
    if (command === 'npx') {
      await fs.writeFile(path.join(cwd, 'package-lock.json'), '{}\n');
    } else if (
      args[0] === 'scripts/build-registry.mjs' &&
      !args.includes('--check')
    ) {
      await fs.writeFile(
        path.join(fixture.repoRoot, 'registry.json'),
        'changed\n',
      );
      throw new Error('registry build failed');
    }
  };

  await assert.rejects(
    createRecipeScaffold({ ...fixture, run }),
    /registry build failed/,
  );
  await assert.rejects(fs.access(path.join(fixture.repoRoot, 'recipes', id)));
  assert.equal(
    await fs.readFile(path.join(fixture.repoRoot, 'registry.json'), 'utf8'),
    '[]\n',
  );
});

test('placeholder code is allowed only while its recipe stays hidden', async (t) => {
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), 'recipe-scaffold-ready-'),
  );
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const recipeDir = path.join(temp, 'recipes', 'example');
  await fs.mkdir(path.join(recipeDir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(recipeDir, 'recipe.json'),
    JSON.stringify({
      id: 'example',
      hidden: true,
      codeAssets: [{ repoPath: 'recipes/example' }],
    }),
  );
  await fs.writeFile(
    path.join(recipeDir, 'README.md'),
    'GLEAN_RECIPE_SCAFFOLD_TODO\n',
  );
  await fs.writeFile(
    path.join(recipeDir, 'src', 'main.ts'),
    '// GLEAN_RECIPE_SCAFFOLD_TODO\n',
  );

  assert.deepEqual(await scaffoldReadinessErrors({ repoRoot: temp }), []);
  await fs.writeFile(
    path.join(recipeDir, 'recipe.json'),
    JSON.stringify({
      id: 'example',
      hidden: false,
      codeAssets: [],
    }),
  );
  assert.deepEqual(await scaffoldReadinessErrors({ repoRoot: temp }), [
    'example: remove GLEAN_RECIPE_SCAFFOLD_TODO from recipes/example/README.md before making the recipe visible',
    'example: remove GLEAN_RECIPE_SCAFFOLD_TODO from recipes/example/src/main.ts before making the recipe visible',
  ]);
});
