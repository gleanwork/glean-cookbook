import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const recipeRoot = fileURLToPath(new URL('..', import.meta.url));
const tsx = path.join(recipeRoot, 'node_modules', '.bin', 'tsx');

function runCli(args: string[]) {
  return spawnSync(tsx, ['src/cli.ts', ...args], {
    cwd: recipeRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

test('start script does not hardcode --bundle', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(recipeRoot, 'package.json'), 'utf8'),
  ) as { scripts: { start: string; verify: string } };
  expect(pkg.scripts.start).toBe('tsx src/cli.ts');
  expect(pkg.scripts.verify).toBe('tsx src/cli.ts verify --yes');
});

test('npm start -- --bundle path/to/SKILL.md parses', () => {
  const result = runCli([
    '--bundle',
    'path/to/SKILL.md',
    '--email',
    'you@example.com',
    '--yes',
  ]);
  const output = `${result.stdout}\n${result.stderr}`;
  expect(output).not.toMatch(/can only be set once/i);
  expect(output).toMatch(/ENOENT|no such file or directory/i);
});

test('npm start -- --help prints help', () => {
  const result = runCli(['--help']);
  expect(result.stderr).not.toMatch(/can only be set once/i);
  expect(result.stdout).toMatch(/npm start -- \[options\]/);
  expect(result.status).toBe(0);
});
