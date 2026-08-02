// The point of this recipe is that retrieval respects the *caller's*
// permissions, not the token's. A run that returns cited answers proves almost
// nothing on its own -- the check that matters is differential: the same query
// must be answerable for a user with access and unanswerable for one without,
// via a single admin token and X-Glean-Act-As.
//
// Which query is the restricted one is derived from the recipe's own
// demoQueries, not hardcoded here: it's whichever query's expectedBehavior
// describes access-dependent results.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_INSTANCE',
  'ANTHROPIC_API_KEY',
  // act-as needs a global/admin token plus two real identities. Without both,
  // the differential check can't run and the recipe's core claim goes untested.
  'VERIFY_USER_WITH_ACCESS',
  'VERIFY_USER_WITHOUT_ACCESS',
];

const REFUSAL = /don't have information/i;

async function ask(context, query, actAs) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/permissions-aware-rag/python',
  );
  const args = ['run', '--locked', 'main.py', query];
  if (actAs) args.push('--act-as', actAs);
  const { stdout } = await execFileAsync('uv', args, {
    cwd,
    env: { ...process.env, X_GLEAN_INCLUDE_EXPERIMENTAL: 'true' },
    maxBuffer: 10 * 1024 * 1024,
  });
  // main.py prints the answer, then a "Sources:" block of "  [n] title — url".
  const [answer, sources = ''] = stdout.split(/\nSources:\n/);
  const citations = sources
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\[\d+\]/.test(line));
  return { answer: answer.trim(), citations };
}

function isPermissionDifferentiated(recipe, query) {
  const entry = recipe.demoQueries.find((q) => q.query === query);
  return /without that access|no citation|permission/i.test(
    entry?.expectedBehavior ?? '',
  );
}

export async function run(query, context) {
  const allowed = await ask(
    context,
    query,
    process.env.VERIFY_USER_WITH_ACCESS,
  );

  if (!allowed.answer) return 'answer was empty for the user with access';
  if (allowed.citations.length === 0) {
    return 'no citations for the user with access — retrieval returned nothing';
  }
  for (const line of allowed.citations) {
    if (!/https?:\/\//.test(line)) {
      return `citation has no real URL: ${line}`;
    }
  }

  if (!isPermissionDifferentiated(context.recipe, query)) return null;

  const denied = await ask(
    context,
    query,
    process.env.VERIFY_USER_WITHOUT_ACCESS,
  );
  if (denied.citations.length > 0) {
    return (
      `${process.env.VERIFY_USER_WITHOUT_ACCESS} got ${denied.citations.length} ` +
      `citation(s) for a restricted document — ACL filtering did not apply`
    );
  }
  if (!REFUSAL.test(denied.answer)) {
    return (
      `restricted user got a substantive answer rather than a refusal, meaning ` +
      `the model fabricated from absent context: ${denied.answer.slice(0, 160)}`
    );
  }
  return null;
}
