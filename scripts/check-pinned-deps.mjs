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

/**
 * Reads a PEP 723 inline script metadata block:
 *
 *   # /// script
 *   # dependencies = ["glean-api-client==0.15.4"]
 *   # ///
 *
 * Python recipes declare deps inline so `uv run main.py` is the whole install
 * and run step, which means the pin guarantee has to be enforced here too --
 * there is no requirements.txt left to check.
 */
function readInlineDependencies(source) {
  const match = source.match(/^# \/\/\/ script$([\s\S]*?)^# \/\/\/$/m);
  if (!match) return null;
  const body = match[1]
    .split('\n')
    .map((line) => line.replace(/^#\s?/, ''))
    .join('\n');
  const deps = body.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (!deps) return [];
  return [...deps[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

function checkInlineScript(label, filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const deps = readInlineDependencies(source);
  if (deps === null) return false;
  const rel = path.relative(repoRoot, filePath);
  for (const spec of deps) {
    const [name] = spec.split(/[=<>~!]/, 1);
    if (!GLEAN_SDKS.has(name)) continue;
    if (!spec.includes('==')) {
      failed = true;
      console.error(
        `✗ ${label} (${rel}): "${spec}" is not pinned with == to an exact version`,
      );
    } else {
      console.log(`✓ ${label} (${rel}): ${spec} pinned`);
    }
  }
  return true;
}

if (!fs.existsSync(recipesDir)) {
  console.log('No recipes/ directory yet — nothing more to check.');
} else {
  const recipeIds = fs
    .readdirSync(recipesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (recipeIds.length === 0) {
    console.log('No recipes yet — nothing more to check.');
  }

  for (const recipeId of recipeIds) {
    const recipeDir = path.join(recipesDir, recipeId);
    for (const sub of walkDirs(recipeDir)) {
      const pkgJson = path.join(sub, 'package.json');
      if (fs.existsSync(pkgJson))
        checkPackageJson(`recipes/${recipeId}`, pkgJson);

      const requirementsTxt = path.join(sub, 'requirements.txt');
      if (fs.existsSync(requirementsTxt))
        checkRequirementsTxt(`recipes/${recipeId}`, requirementsTxt);

      for (const entry of fs.readdirSync(sub, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.py')) continue;
        checkInlineScript(`recipes/${recipeId}`, path.join(sub, entry.name));
      }
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
  '\nAll Glean SDK dependencies are pinned to exact released versions.',
);
