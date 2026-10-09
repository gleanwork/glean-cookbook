import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scaffold = 'npx -y tiged@2.12.8 owner/repo/recipe demo';
// Downloads recipes/demo from this repository, so its real subdirectories exist.
const cookbookScaffold =
  'npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/demo demo';

// A string is a command step; an object is a whole step.
function checkCommands(t, steps, { directories = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-commands-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'recipes/demo'), { recursive: true });
  for (const directory of directories) {
    fs.mkdirSync(path.join(root, 'recipes/demo', directory), {
      recursive: true,
    });
  }
  for (const file of [
    'check-recipe-commands.mjs',
    'lib/jsonc.mjs',
    'lib/step-shell.mjs',
  ]) {
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', file),
      path.join(root, 'scripts', file),
    );
  }
  fs.writeFileSync(
    path.join(root, 'recipes/demo/recipe.json'),
    JSON.stringify({
      id: 'demo',
      steps: steps.map((step) =>
        typeof step === 'string' ? { command: step } : step,
      ),
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
  assert.match(result.stderr, /\[1\] runs npm from \., outside demo/);
});

test('does not treat a subshell as a persistent directory change', (t) => {
  const result = checkCommands(t, [
    scaffold,
    '(cd demo && npm install)',
    'npm test',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[2\] runs npm from \., outside demo/);
});

// The defect this check exists for: each step re-entering the project. In one
// shell, the second `cd demo` runs from inside demo and fails.
test('rejects repeating the project cd on a later step', (t) => {
  const result = checkCommands(t, [
    scaffold,
    'cd demo && npm install',
    'cd demo && npm run configure -- --email "<work-email>"',
    'npm run dev',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /demo steps\[2\] runs `cd demo` from demo, where it does not exist/,
  );
  assert.match(result.stderr, /set "newTerminal": true/);
});

test('rejects a repeated cd hidden inside a subshell', (t) => {
  const result = checkCommands(t, [
    scaffold,
    'cd demo && npm install',
    '(cd demo && npm test)',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /steps\[2\] runs `cd demo` from demo/);
});

test('rejects a repeated cd on a later line of a multi-line step', (t) => {
  const result = checkCommands(t, [
    scaffold,
    'cd demo && npm ci\ncd demo && npm test',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /steps\[1\] runs `cd demo` from demo/);
});

test('a new-terminal step starts in the starting directory', (t) => {
  const result = checkCommands(t, [
    scaffold,
    'cd demo && npm install',
    'npm start',
    {
      command: 'cloudflared tunnel --url http://127.0.0.1:8787',
      newTerminal: true,
    },
    { command: 'cd demo && npm run setup', newTerminal: true },
    'npm run delete',
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test('a new-terminal step must enter the project again', (t) => {
  const result = checkCommands(t, [
    scaffold,
    'cd demo && npm install',
    'npm start',
    { command: 'npm run setup', newTerminal: true },
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[3\] runs npm from \., outside demo/);
});

test('rejects newTerminal before any earlier command', (t) => {
  const result = checkCommands(t, [
    { command: scaffold, newTerminal: true },
    'cd demo && npm install',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot open a new terminal/);
});

test('cd succeeds only into directories the scaffold downloads', (t) => {
  const ok = checkCommands(
    t,
    [cookbookScaffold, '(cd demo/tool-server && uv run server.py)'],
    { directories: ['tool-server'] },
  );
  assert.equal(ok.status, 0, ok.stderr);

  const missing = checkCommands(
    t,
    [cookbookScaffold, '(cd demo/missing && uv run server.py)'],
    { directories: ['tool-server'] },
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /runs `cd demo\/missing` from \./);
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
