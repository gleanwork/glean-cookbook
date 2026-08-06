// Delegates to recipes/onboarding-hub/platform-chat/scripts/verify.mjs so
// `verify:recipe onboarding-hub` exercises the recipe's own live gate.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const sideEffects = 'read-only';

// The checklist is reader-supplied by design -- this recipe never invents one --
// so verify needs one too. Declared here rather than discovered mid-run, which
// reported four failed demo queries when the real answer was "set this".
export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_SERVER_URL',
  ['GLEAN_ONBOARDING_STEPS_JSON', 'GLEAN_ONBOARDING_STEPS_FILE'],
];

export async function setup(context) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/onboarding-hub/platform-chat',
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
