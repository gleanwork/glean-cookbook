import fs from 'node:fs';
import path from 'node:path';

import fg from 'fast-glob';

import {
  LEGACY_CODE_PATTERN_TARGETS,
  LEGACY_OAUTH_HELPER_TARGETS,
  MODERN_PATTERN_HINT,
  NON_CODE_EXAMPLE_FILES,
} from './legacy-recipe-patterns.mjs';

const IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.venv/**',
  // Generated framework copies are checked at their framework source.
  '**/lib/cookbook-server.ts',
];
const SOURCE_GLOB = '**/*.{ts,tsx,mts,cts,js,mjs,cjs}';
const CONFIG_FILE = /(?:^|\/)(?:eslint|vite|vitest|tsup)\.config\.[cm]?[jt]s$/u;

export const RULES = Object.freeze({
  'oauth-helper': 'ships the copied scripts/glean-auth.mjs helper',
  'static-api-token':
    'passes a static GLEAN_API_TOKEN to the Glean SDK without createGleanTokenProvider',
  'env-file-parsing': 'depends on dotenv or parses .env by hand',
  'node-test-runner': 'runs TypeScript tests with node:test / node --test',
  'missing-vitest': 'is a TypeScript package without a Vitest `test` script',
});

function posix(file) {
  return file.split(path.sep).join('/');
}

function read(repoRoot, file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function sourceFiles(repoRoot, directory) {
  return fg
    .sync(SOURCE_GLOB, {
      cwd: path.join(repoRoot, directory),
      ignore: IGNORE,
      followSymbolicLinks: false,
    })
    .map((file) => `${directory}/${file}`)
    .filter((file) => !CONFIG_FILE.test(file))
    .filter((file) => !file.endsWith('/scripts/glean-auth.mjs'))
    .filter((file) => !Object.hasOwn(NON_CODE_EXAMPLE_FILES, file))
    .sort();
}

function isTestFile(file) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file);
}

const HAND_ROLLED_ENV = /['"`][^'"`]*\.env(?:\.local)?['"`]/u;
const READS_FILE = /\breadFile(?:Sync)?\s*\(/u;
const SPLITS_ASSIGNMENT =
  /\.split\(\s*['"`]=['"`]|\.indexOf\(\s*['"`]=['"`]|\/\^\s*\(?\[?[^/]*\]?\*?\)?\s*=|\(\[\^=/u;

function packageDirectories(repoRoot) {
  return fg
    .sync('recipes/**/package.json', { cwd: repoRoot, ignore: IGNORE })
    .map((file) => path.posix.dirname(posix(file)))
    .sort();
}

/**
 * Returns every legacy code pattern found outside its allowlist, plus every
 * allowlist entry that no longer matches (so the lists can only shrink).
 */
export function recipeCodePatternViolations({
  repoRoot,
  helperTargets = LEGACY_OAUTH_HELPER_TARGETS,
  allowlists = LEGACY_CODE_PATTERN_TARGETS,
}) {
  const found = new Map(Object.keys(RULES).map((rule) => [rule, new Map()]));
  const record = (rule, directory, detail) => {
    if (!found.get(rule).has(directory)) found.get(rule).set(directory, detail);
  };

  for (const helper of fg.sync('recipes/**/scripts/glean-auth.mjs', {
    cwd: repoRoot,
    ignore: IGNORE,
  })) {
    record(
      'oauth-helper',
      path.posix.dirname(path.posix.dirname(posix(helper))),
      posix(helper),
    );
  }

  for (const directory of packageDirectories(repoRoot)) {
    const packageJson = JSON.parse(read(repoRoot, `${directory}/package.json`));
    const scripts = packageJson.scripts ?? {};
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const sources = sourceFiles(repoRoot, directory);
    const isTypeScript = fs.existsSync(
      path.join(repoRoot, directory, 'tsconfig.json'),
    );
    // A package that exists only to lint an exempt snippet is not a recipe
    // package for these rules.
    if (sources.length === 0) continue;

    const runtimeSources = sources.filter((file) => !isTestFile(file));
    const texts = new Map(sources.map((file) => [file, read(repoRoot, file)]));
    const providesTokens = runtimeSources.some((file) =>
      texts.get(file).includes('createGleanTokenProvider'),
    );
    const staticTokenFile = runtimeSources.find((file) => {
      const text = texts.get(file);
      return (
        text.includes('GLEAN_API_TOKEN') &&
        /@gleanwork\/api-client|new\s+Glean\s*\(/u.test(text)
      );
    });
    if (staticTokenFile && !providesTokens) {
      record('static-api-token', directory, staticTokenFile);
    }

    if (dependencies.dotenv) {
      record('env-file-parsing', directory, `${directory}/package.json`);
    }
    const envParser = runtimeSources.find((file) => {
      const text = texts.get(file);
      return (
        HAND_ROLLED_ENV.test(text) &&
        READS_FILE.test(text) &&
        SPLITS_ASSIGNMENT.test(text)
      );
    });
    if (envParser) record('env-file-parsing', directory, envParser);

    if (isTypeScript) {
      const nodeTestScript = Object.entries(scripts).find(([, command]) =>
        /\bnode\b[^&|;]*\s--test\b/u.test(command),
      );
      const nodeTestImport = sources.find((file) =>
        /from\s+['"]node:test['"]|require\(\s*['"]node:test['"]\s*\)/u.test(
          texts.get(file),
        ),
      );
      if (nodeTestScript) {
        record(
          'node-test-runner',
          directory,
          `${directory}/package.json scripts.${nodeTestScript[0]}`,
        );
      } else if (nodeTestImport) {
        record('node-test-runner', directory, nodeTestImport);
      }
      if (
        !/^vitest(?:\s+run)?(?:\s|$)/u.test(scripts.test ?? '') ||
        typeof dependencies.vitest !== 'string'
      ) {
        record('missing-vitest', directory, `${directory}/package.json`);
      }
    }
  }

  const violations = [];
  for (const [rule, directories] of found) {
    const allowlist =
      rule === 'oauth-helper' ? helperTargets : (allowlists[rule] ?? {});
    for (const [directory, detail] of directories) {
      if (Object.hasOwn(allowlist, directory)) continue;
      violations.push({
        rule,
        directory,
        message: `${directory}: ${detail} ${RULES[rule]}. ${MODERN_PATTERN_HINT}`,
      });
    }
    if (rule === 'oauth-helper') continue; // artifacts:check owns stale helper entries.
    for (const directory of Object.keys(allowlist)) {
      if (directories.has(directory)) continue;
      violations.push({
        rule,
        directory,
        message: `${directory}: no longer ${RULES[rule]}; remove it from LEGACY_CODE_PATTERN_TARGETS['${rule}'] in scripts/lib/legacy-recipe-patterns.mjs.`,
      });
    }
  }
  return violations;
}
