// The recipe's own verify script (recipes/acme-answers/chat-api/scripts/verify.mjs)
// starts the built server and drives it end to end, which is a stronger check
// than calling the API directly -- it exercises the recipe's extraction code,
// where the citations bug actually lived. This module delegates to it rather
// than duplicating it, and exists so `verify:recipe acme-answers` works the same
// way as every other recipe.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const requiredEnv = ['GLEAN_API_TOKEN', 'GLEAN_INSTANCE'];

export async function setup(context) {
  const cwd = path.join(context.repoRoot, 'recipes/acme-answers/chat-api');
  try {
    const { stdout } = await execFileAsync('node', ['scripts/verify.mjs'], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { output: stdout, failure: null };
  } catch (error) {
    // Non-zero exit means at least one query failed; surface its own report.
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
  // Its output lines are `✓ "<query>" — n citation(s)`.
  if (!context.output.includes(`"${query}"`)) {
    return (
      `the recipe's own verify script did not report a result for this query — ` +
      `it may be hardcoding a different set than demoQueries`
    );
  }
  return null;
}
