import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

const sourceRoot = path.resolve(import.meta.dirname, '..');

async function writeJson(file, value) {
  await fs.outputFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test('reports recipe schema errors before compiling framework declarations', async (t) => {
  const repoRoot = await fs.mkdtemp(
    path.join(sourceRoot, '.validate-registry-fixture-'),
  );
  t.after(() => fs.remove(repoRoot));

  await Promise.all([
    fs.copy(path.join(sourceRoot, 'scripts'), path.join(repoRoot, 'scripts')),
    fs.copy(
      path.join(sourceRoot, 'schemas/recipe.schema.json'),
      path.join(repoRoot, 'schemas/recipe.schema.json'),
    ),
    fs.copy(
      path.join(sourceRoot, 'schemas/framework-feature.schema.json'),
      path.join(repoRoot, 'schemas/framework-feature.schema.json'),
    ),
    fs.copy(
      path.join(sourceRoot, 'config/recipe-taxonomy.json'),
      path.join(repoRoot, 'config/recipe-taxonomy.json'),
    ),
    fs.copy(
      path.join(sourceRoot, 'config/execution-types.json'),
      path.join(repoRoot, 'config/execution-types.json'),
    ),
    writeJson(path.join(repoRoot, 'package.json'), {}),
    writeJson(path.join(repoRoot, 'recipes/example/recipe.json'), {
      id: 'example',
      codeAssets: {},
    }),
  ]);

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/validate-registry.mjs')],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /fails schemas\/recipe\.schema\.json/u);
  assert.doesNotMatch(result.stderr, /framework feature declarations/u);
});
