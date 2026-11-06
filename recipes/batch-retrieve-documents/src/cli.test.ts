import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parseCliOptions } from './cli.js';

const recipeRoot = fileURLToPath(new URL('..', import.meta.url));
const tsx = path.join(recipeRoot, 'node_modules', '.bin', 'tsx');

function runCli(args: string[]) {
  return spawnSync(tsx, ['src/cli.ts', ...args], {
    cwd: recipeRoot,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      GLEAN_API_TOKEN: 'fixture-token',
      GLEAN_SERVER_URL: 'https://example.test',
      NO_COLOR: '1',
    },
  });
}

test('preserves mixed selector order', () => {
  expect(
    parseCliOptions([
      '--email',
      'person@example.com',
      '--url',
      'https://docs.example/wiki/plan',
      '--id',
      'doc/1',
      '--url=https://example.invalid/not-indexed',
      '--content',
    ]),
  ).toEqual({
    email: 'person@example.com',
    serverUrl: undefined,
    content: true,
    specs: [
      { url: 'https://docs.example/wiki/plan' },
      { document_id: 'doc/1' },
      { url: 'https://example.invalid/not-indexed' },
    ],
  });
});

test('rejects a blank selector', () => {
  expect(() => parseCliOptions(['--id', '   '])).toThrow(/--id/);
  expect(() => parseCliOptions(['--url'])).toThrow(/--url requires a value/);
});

test('npm start -- --help describes results and warnings', () => {
  const result = runCli(['--help']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('documents:read');
  expect(result.stdout).toContain('warnings');
  expect(result.stdout).toContain('--content');
});

test('no selectors exits non-zero without a successful batch line', () => {
  const result = runCli(['--server-url', 'https://example.test']);
  expect(result.status).toBe(1);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/--url or --id/);
  expect(result.stdout).not.toContain('Retrieved');
});
