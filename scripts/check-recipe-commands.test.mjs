import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scaffold = 'npx -y tiged@2.12.8 owner/repo/recipe demo';

function checkCommands(t, commands) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-commands-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'recipes/demo'), { recursive: true });
  for (const file of ['check-recipe-commands.mjs', 'lib/jsonc.mjs']) {
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', file),
      path.join(root, 'scripts', file),
    );
  }
  fs.writeFileSync(
    path.join(root, 'recipes/demo/recipe.json'),
    JSON.stringify({
      id: 'demo',
      steps: commands.map((command) => ({ command })),
    }),
  );
  return spawnSync(
    process.execPath,
    [path.join(root, 'scripts/check-recipe-commands.mjs')],
    { encoding: 'utf8' },
  );
}

test('accepts entering the project once and continuing in that directory', (t) => {
  const result = checkCommands(t, [
    scaffold,
    'cd demo && npm install',
    'npm test',
    'npm start',
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a project command before entering the scaffold directory', (t) => {
  const result = checkCommands(t, [scaffold, 'npm install']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must enter demo/);
});

test('does not treat a subshell as a persistent directory change', (t) => {
  const result = checkCommands(t, [
    scaffold,
    '(cd demo && npm install)',
    'npm test',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must enter demo/);
});

test('still rejects unpinned or interactive scaffold commands', (t) => {
  const result = checkCommands(t, [
    'npx tiged owner/repo/recipe demo',
    'cd demo && npm install',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must pin tiged/);
  assert.match(result.stderr, /must use non-interactive npx/);
});

const recipe = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'recipes/validate-and-publish-skill/recipe.json'),
    'utf8',
  ),
);

test('raw pilot steps keep every npm command in the recipe directory', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-step-sequence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Stub external operations only. Execute the authored commands without a
  // renderer or rewrite, so a repeated cd fails in the real shell.
  const shell = [
    'npx() { mkdir "${@: -1}"; }',
    'npm() { printf "%s\\n" "$PWD"; }',
    ...recipe.steps.flatMap((step) => (step.command ? [step.command] : [])),
  ].join('\n');
  const output = execFileSync('bash', ['-e', '-c', shell], {
    cwd: root,
    encoding: 'utf8',
  });
  const expected = path.join(
    fs.realpathSync(root),
    'validate-and-publish-skill',
  );
  assert.deepEqual(
    output
      .trim()
      .split('\n')
      .map((directory) => fs.realpathSync(directory)),
    Array(5).fill(expected),
  );
});

test('pilot execution metadata uses the authored step commands verbatim', () => {
  const command = (kind) =>
    recipe.steps.find((step) => step.kind === kind).command;
  assert.equal(recipe.execution.auth[0].setupCommand, command('authenticate'));
  assert.equal(recipe.execution.verification.command, command('verify-live'));
  assert.equal(recipe.execution.run.command, command('run'));
});
