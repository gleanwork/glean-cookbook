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

test('parses a document URL and optional content', () => {
  expect(
    parseCliOptions([
      '--email',
      'person@example.com',
      '--url',
      'https://docs.example/wiki/plan',
    ]),
  ).toEqual({
    email: 'person@example.com',
    serverUrl: undefined,
    url: 'https://docs.example/wiki/plan',
    content: false,
  });
  expect(
    parseCliOptions([
      '--server-url',
      'https://example.test',
      '--url',
      'https://docs.example/wiki/plan',
      '--content',
    ]).content,
  ).toBe(true);
});

test('rejects a blank URL before any request', () => {
  expect(() => parseCliOptions(['--url', '   '])).toThrow(/--url/);
  expect(() => parseCliOptions(['extra'])).toThrow(/Unexpected argument/);
});

test('npm start -- --help prints the document URL usage', () => {
  const result = runCli(['--help']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('--url');
  expect(result.stdout).toContain('--content');
  expect(result.stdout).toContain('documents:read');
});

test('a missing URL exits non-zero without calling the network', () => {
  const result = runCli(['--server-url', 'https://example.test']);
  expect(result.status).toBe(1);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/--url/);
  expect(result.stdout).not.toContain('Round-trip document_id matches');
});
