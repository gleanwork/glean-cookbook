import { spawn } from 'node:child_process';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fg from 'fast-glob';
import fs from 'fs-extra';

import { resolveFrameworkFeatureImplementations } from './framework-features.mjs';
import { readJsonc } from './jsonc.mjs';

const TODO_MARKER = 'GLEAN_RECIPE_SCAFFOLD_TODO';
const TYPESCRIPT_DEV_DEPENDENCIES = {
  '@types/node': '22.20.1',
  tsx: '4.23.1',
  typescript: '6.0.3',
};

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
  return `# ${draft.title}\n\n${draft.description}\n\n> **Draft:** \`${TODO_MARKER}\`. This scaffold contains no recipe-specific implementation yet. Implement and verify the documented workflow before making it visible.\n\n## Prerequisites\n\n${prerequisites}\n\n## Steps\n\n${steps}\n`;
}

function authFiles(draft) {
  const oauth = draft.execution.auth.find(
    (auth) => auth.kind === 'oauth-with-token-fallback',
  );
  if (!oauth) return [];
  return [
    { path: '.gitignore', content: '.env\n.env.local\n' },
    {
      path: '.env.example',
      content: `${oauth.backendVariable}=\n${oauth.credentialVariable}=\n`,
    },
  ];
}

function typescriptFiles(draft, dependencies) {
  return [
    {
      path: 'package.json',
      content: json({
        name: draft.id,
        version: '0.0.0',
        private: true,
        description: draft.description,
        type: 'module',
        scripts: {
          start: 'tsx src/main.ts',
          typecheck: 'tsc --noEmit',
          check: 'npm run typecheck',
        },
        dependencies,
        devDependencies: TYPESCRIPT_DEV_DEPENDENCIES,
        allowScripts: {
          'esbuild@0.28.2': true,
          fsevents: false,
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
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['src'],
      }),
    },
    {
      path: 'src/main.ts',
      content: `// ${TODO_MARKER}\n\nthrow new Error(\n  'Implement the recipe-specific workflow before running this scaffold.',\n);\n`,
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
  const oauth = draft.execution.auth.find(
    (auth) => auth.kind === 'oauth-with-token-fallback',
  );
  if (
    oauth &&
    (oauth.configFile !== '.env' ||
      oauth.backendVariable !== 'GLEAN_SERVER_URL' ||
      oauth.credentialVariable !== 'GLEAN_API_TOKEN' ||
      !/\bscripts\/glean-auth\.mjs login\b/u.test(oauth.setupCommand ?? ''))
  ) {
    fail(
      'OAuth scaffolds must use scripts/glean-auth.mjs login with .env, GLEAN_SERVER_URL, and GLEAN_API_TOKEN',
    );
  }
  for (const field of ['preview', 'codeWalkthrough', 'pastePromptFile']) {
    if (draft[field]) {
      fail(
        `${field} references authored files and must be added after scaffolding`,
      );
    }
  }
  return asset;
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

  const dependencies = mergeDependencies(implementations);
  const generatedTargets = implementations.map(
    (implementation) => implementation.target,
  );
  if (
    draft.execution.auth.some(
      (auth) => auth.kind === 'oauth-with-token-fallback',
    )
  ) {
    generatedTargets.push('scripts/glean-auth.mjs');
  }
  generatedTargets.sort();
  if (
    new Set(generatedTargets.map((target) => target.toLowerCase())).size !==
    generatedTargets.length
  ) {
    fail('selected infrastructure generates colliding target paths');
  }
  const files = [
    { path: 'recipe.json', content: json(draft) },
    { path: 'README.md', content: renderReadme(draft) },
    ...authFiles(draft),
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
            command: 'npm',
            args: ['install', '--package-lock-only', '--ignore-scripts'],
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
