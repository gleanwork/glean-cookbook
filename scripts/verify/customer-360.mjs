// Delegates to recipes/customer-360/platform-search-chat/scripts/verify.mjs so
// `verify:recipe customer-360` exercises Path A live. Path B (Agents) is
// verified separately via that path's own `npm run verify` when GLEAN_AGENT_ID
// is set.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const sideEffects = 'read-only';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_SERVER_URL',
  'GLEAN_ACCOUNT_NAME',
];

export async function setup(context) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/customer-360/platform-search-chat',
  );
  try {
    const { stdout } = await execFileAsync('node', ['scripts/verify.mjs'], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    return { output: stdout, failure: null };
  } catch (error) {
    return {
      output: error.stdout ?? '',
      failure: error.stderr || error.message,
    };
  }
}

export async function run(query, context) {
  if (context.failure) {
    return `recipe verify script reported a failure:\n${context.failure.trim()}`;
  }
  if (!context.output.includes(`"${query}"`)) {
    return (
      `the recipe's own verify script did not report a result for this query — ` +
      `it may be hardcoding a different set than demoQueries`
    );
  }
  return null;
}
