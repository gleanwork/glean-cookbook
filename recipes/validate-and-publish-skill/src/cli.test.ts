import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const recipeRoot = fileURLToPath(new URL('..', import.meta.url));
const tsx = path.join(recipeRoot, 'node_modules', '.bin', 'tsx');

function runCli(args: string[]) {
  // Only help and local parse failures run in subprocesses. Network workflows
  // use the real client with MSW in workflow.test.ts.
  return spawnSync(tsx, ['src/cli.ts', ...args], {
    cwd: recipeRoot,
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      GLEAN_API_TOKEN: 'fixture-token',
      GLEAN_SERVER_URL: 'https://example.test',
      NO_COLOR: '1',
    },
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
    '--server-url',
    'https://example.test',
    '--yes',
  ]);
  const output = `${result.stdout}\n${result.stderr}`;
  expect(output).not.toMatch(/can only be set once/i);
  expect(output).toMatch(/ENOENT|no such file or directory/i);
  expect(result.status).toBe(1);
});

test('npm start -- --help prints help', () => {
  const result = runCli(['--help']);
  expect(result.stderr).not.toMatch(/can only be set once/i);
  expect(result.stdout).toMatch(/npm start -- \[options\]/);
  expect(result.status).toBe(0);
});
