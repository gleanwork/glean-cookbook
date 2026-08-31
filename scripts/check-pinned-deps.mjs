import fs from 'node:fs';
import path from 'node:path';

import { installScriptPolicyErrors } from './lib/install-script-policy.mjs';

/**
 * Node-side dependency policy: exact Glean SDK versions plus explicit
 * approval or denial of every dependency install script. This also checks
 * requirements.txt pins, which Node can read natively.
 *
 * Python recipes that declare dependencies inline (PEP 723) are checked by
 * scripts/check_pinned_deps.py instead -- it reads the specifiers uv already
 * parsed into each `<script>.py.lock`, via the standard library's TOML reader,
 * rather than re-implementing PEP 723 extraction here in JavaScript. CI runs
 * both.
 */

const repoRoot = path.resolve(import.meta.dirname, '..');
// Both trees: examples/ holds runnable code that is not a registry recipe, and
// its pins matter exactly as much.
const scanDirs = [
  path.join(repoRoot, 'recipes'),
  path.join(repoRoot, 'examples'),
].filter((dir) => fs.existsSync(dir));

const GLEAN_SDKS = new Set([
  'glean-api-client',
  '@gleanwork/api-client',
  '@gleanwork/auth',
  '@gleanwork/web-sdk',
  'glean-indexing-sdk',
]);

const RANGE_PREFIX = /^[\^~>=<]/;

let failed = false;
let checkedInstallScriptPolicies = 0;

function checkPackageJson(label, filePath) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(deps)) {
    if (!GLEAN_SDKS.has(name)) continue;
    if (RANGE_PREFIX.test(version) || version === '*' || version === 'latest') {
      failed = true;
      console.error(
        `✗ ${label}: ${name}@${version} is not pinned to an exact released version`,
      );
    } else {
      console.log(`✓ ${label}: ${name}@${version} pinned`);
    }
  }

  const lockfilePath = path.join(path.dirname(filePath), 'package-lock.json');
  if (fs.existsSync(lockfilePath)) {
    checkedInstallScriptPolicies += 1;
    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    for (const error of installScriptPolicyErrors(pkg, lockfile)) {
      failed = true;
      console.error(`✗ ${path.relative(repoRoot, filePath)}: ${error}`);
    }
  }
}

function checkRequirementsTxt(label, filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [name] = line.split(/[=<>~!]/, 1);
    if (!GLEAN_SDKS.has(name)) continue;
    if (!line.includes('==')) {
      failed = true;
      console.error(
        `✗ ${label}: "${line}" is not pinned with == to an exact version`,
      );
    } else {
      console.log(`✓ ${label}: ${line} pinned`);
    }
  }
}

if (scanDirs.length === 0) {
  console.log(
    'No recipes/ or examples/ directory yet — nothing more to check.',
  );
} else {
  const recipeIds = scanDirs.flatMap((dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name)),
  );

  if (recipeIds.length === 0) {
    console.log('No recipes yet — nothing more to check.');
  }

  for (const recipeDir of recipeIds) {
    const recipeId = path.relative(repoRoot, recipeDir);
    for (const sub of walkDirs(recipeDir)) {
      const pkgJson = path.join(sub, 'package.json');
      if (fs.existsSync(pkgJson)) checkPackageJson(recipeId, pkgJson);

      const requirementsTxt = path.join(sub, 'requirements.txt');
      if (fs.existsSync(requirementsTxt))
        checkRequirementsTxt(recipeId, requirementsTxt);
    }
  }
}

function* walkDirs(dir) {
  yield dir;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      entry.name !== '.venv'
    ) {
      yield* walkDirs(path.join(dir, entry.name));
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `\nAll Glean SDK dependencies are pinned, and install-script policies cover ${checkedInstallScriptPolicies} npm lockfile(s).`,
);
