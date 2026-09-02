import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const sideEffects = 'read-only';
export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_SERVER_URL',
  'GLEAN_DEMO_QUERY',
];

export async function run(_query, context) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/streaming-chat-with-citations',
  );
  try {
    await execFileAsync(
      'npm',
      [
        'run',
        'verify',
        '--',
        '--server-url',
        process.env.GLEAN_SERVER_URL,
        '--prompt',
        process.env.GLEAN_DEMO_QUERY,
      ],
      {
        cwd,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return null;
  } catch (error) {
    return error.stderr?.trim() || error.stdout?.trim() || error.message;
  }
}
