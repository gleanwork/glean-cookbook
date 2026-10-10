import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const recipeRoot = fileURLToPath(new URL('..', import.meta.url));
const tsx = path.join(recipeRoot, 'node_modules', '.bin', 'tsx');

function runCli(args: string[]) {
  // Only help and local argument failures run in subprocesses. Network
  // workflows use the real client with MSW in workflow.test.ts.
  return spawnSync(tsx, ['src/main.ts', ...args], {
    cwd: recipeRoot,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      GLEAN_API_TOKEN: 'fixture-token',
      GLEAN_SERVER_URL: 'https://example.test',
      NO_COLOR: '1',
    },
  });
}

test('npm start -- --help prints usage', () => {
  const result = runCli(['--help']);
  expect(result.stdout).toContain('npm start -- <plugin-path> [options]');
  expect(result.status).toBe(0);
});

test('a missing plugin path fails before signing in', () => {
  const result = runCli(['does-not-exist', '--dry-run']);
  expect(result.stderr).toMatch(
    /error: No plugin folder or zip at .*does-not-exist/,
  );
  expect(result.stdout).not.toContain('GLEAN_API_TOKEN');
  expect(result.status).toBe(1);
});

test('running without a plugin path explains what to pass', () => {
  const result = runCli([]);
  expect(result.stderr).toContain('Pass the plugin folder or zip to import.');
  expect(result.status).toBe(1);
});
