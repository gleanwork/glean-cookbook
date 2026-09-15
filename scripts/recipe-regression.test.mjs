import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyRecipeFixture } from './lib/recipe-regression.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('runs a scaffold recipe fixture phase from a fresh sequential shell', async (t) => {
  const report = await verifyRecipeFixture({
    recipeId: 'validate-and-publish-skill',
    repoRoot,
  });
  t.after(() => report.cleanup());

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.commands, [
    'cd validate-and-publish-skill && npm install',
    'npm test',
  ]);
  assert.match(report.stdout, /Test Files\s+6 passed/u);
  assert.equal(report.workspace.startsWith(repoRoot), false);
  assert.equal(report.behavior.status, 'passed');
  assert.deepEqual(report.behavior.requests, [
    'POST /api/skills/validation',
    'POST /api/skills/validation',
    'POST /api/skills',
    'GET /api/skills?page_size=100',
    'GET /api/skills/fixture-skill-id',
    'GET /api/skills/fixture-skill-id/content',
    'DELETE /api/skills/fixture-skill-id',
  ]);
  assert.match(report.behavior.stdout, /at version 1\.1/u);
  assert.match(report.behavior.stdout, /cleanup completed/u);
  assert.match(report.sourceDigest, /^[a-f0-9]{64}$/u);
});

test('reports partial when no behavior fixture is registered', async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cookbook-regression-test-'),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const recipeDirectory = path.join(root, 'recipes/example');
  fs.mkdirSync(recipeDirectory, { recursive: true });
  fs.writeFileSync(path.join(recipeDirectory, 'marker.txt'), 'fixture\n');
  fs.writeFileSync(
    path.join(recipeDirectory, 'recipe.json'),
    JSON.stringify({
      id: 'example',
      steps: [
        {
          kind: 'scaffold',
          command: 'npx -y tiged@2.12.8 example/repo example',
        },
        {
          kind: 'install',
          command: 'cd example && test -f marker.txt',
        },
      ],
    }),
  );

  const report = await verifyRecipeFixture({
    recipeId: 'example',
    repoRoot: root,
  });
  t.after(() => report.cleanup());
  assert.equal(report.status, 'partial');
  assert.equal(report.behavior.status, 'not-configured');
});
