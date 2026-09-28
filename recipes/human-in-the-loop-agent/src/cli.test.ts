import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const recipeRoot = fileURLToPath(new URL('..', import.meta.url));
const tsx = path.join(recipeRoot, 'node_modules', '.bin', 'tsx');

function runCli(args: string[]) {
  // Only help and argument errors run here: they fail before any request.
  // The network workflow is covered with MSW in workflow.test.ts.
  return spawnSync(tsx, ['src/cli.ts', ...args], {
    cwd: recipeRoot,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      GLEAN_API_TOKEN: 'fixture-token',
      GLEAN_SERVER_URL: 'https://example.test',
      GLEAN_AGENT_ID: 'agent-1',
      NO_COLOR: '1',
    },
  });
}

test('--help lists the one-command flow and the reconnect commands', () => {
  const result = runCli(['--help']);
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/--agent-id <id> --email <work-email>/);
  expect(result.stdout).toMatch(/resume --agent-id <id> --run-id <id>/);
});

test.each([
  [['frobnicate'], /Unknown command: frobnicate/],
  [['resume'], /--run-id is required/],
  [['--run-id', 'run-1'], /use: npm start -- resume --agent-id <id> --run-id/],
  [['resume', '--run-id', 'r', '--decision', 'approve'], /go together/],
  [
    ['resume', '--run-id', 'r', '--decision', 'yes', '--interaction-id', 'c'],
    /--decision must be approve or reject/,
  ],
  // A decision only makes sense for a run someone has already reviewed.
  [
    ['--decision', 'approve', '--interaction-id', 'c'],
    /continue an existing run, use: npm start -- resume/,
  ],
  [['--wait-seconds', '0'], /greater than zero/],
])('rejects %j before contacting Glean', (args, message) => {
  const result = runCli(args);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(message);
  // A clean one-line error, never a stack trace.
  expect(result.stderr).not.toMatch(/\n\s+at /);
});
