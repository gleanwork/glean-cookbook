import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesDir = path.join(repoRoot, 'recipes');

const GLEAN_SDKS = new Set([
  'glean-api-client',
  '@gleanwork/api-client',
  '@gleanwork/web-sdk',
  'glean-indexing-sdk',
]);

const RANGE_PREFIX = /^[\^~>=<]/;

let failed = false;

function checkPackageJson(recipeId, filePath) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(deps)) {
    if (!GLEAN_SDKS.has(name)) continue;
    if (RANGE_PREFIX.test(version) || version === '*' || version === 'latest') {
      failed = true;
      console.error(
        `✗ recipes/${recipeId}: ${name}@${version} is not pinned to an exact released version`,
      );
    } else {
      console.log(`✓ recipes/${recipeId}: ${name}@${version} pinned`);
    }
  }
}

function checkRequirementsTxt(recipeId, filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [name] = line.split(/[=<>~!]/, 1);
    if (!GLEAN_SDKS.has(name)) continue;
    if (!line.includes('==')) {
      failed = true;
      console.error(
        `✗ recipes/${recipeId}: "${line}" is not pinned with == to an exact version`,
      );
    } else {
      console.log(`✓ recipes/${recipeId}: ${line} pinned`);
    }
  }
}

if (!fs.existsSync(recipesDir)) {
  console.log('No recipes/ directory yet — nothing to check.');
  process.exit(0);
}

const recipeIds = fs
  .readdirSync(recipesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (recipeIds.length === 0) {
  console.log('No recipes yet — nothing to check.');
  process.exit(0);
}

for (const recipeId of recipeIds) {
  const recipeDir = path.join(recipesDir, recipeId);
  for (const sub of walkDirs(recipeDir)) {
    const pkgJson = path.join(sub, 'package.json');
    if (fs.existsSync(pkgJson)) checkPackageJson(recipeId, pkgJson);

    const requirementsTxt = path.join(sub, 'requirements.txt');
    if (fs.existsSync(requirementsTxt))
      checkRequirementsTxt(recipeId, requirementsTxt);
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
  '\nAll Glean SDK dependencies are pinned to exact released versions.',
);
