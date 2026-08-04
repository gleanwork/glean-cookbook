// The recipe's claim is that the caller's own credential is the permission
// boundary, so results arrive already filtered and nothing needs impersonating.
// From a single identity you cannot show "user A sees it, user B doesn't" -- but
// the property that actually protects people is checkable: when retrieval comes
// back empty, the app must refuse rather than answer from the model's own
// knowledge. A confident answer with no sources is the failure this whole
// architecture exists to prevent, and it is the one an LLM produces by default.
//
// This deliberately no longer requires a global/admin token. An earlier version
// did, to drive an impersonation header that belongs to a different
// architecture than the one this recipe teaches.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Platform API search plus an LLM call to a third party; nothing is written to Glean.
export const sideEffects = 'read-only';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_INSTANCE',
  'ANTHROPIC_API_KEY',
];

const REFUSAL =
  /don't have information|no information|cannot find|couldn't find/i;

async function ask(context, query) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/permissions-aware-retrieval/python',
  );
  const { stdout } = await execFileAsync(
    'uv',
    ['run', '--locked', 'main.py', query],
    {
      cwd,
      env: { ...process.env, X_GLEAN_INCLUDE_EXPERIMENTAL: 'true' },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  // main.py prints the answer, then a "Sources:" block of "  [n] title — url".
  const [answer, sources = ''] = stdout.split(/\nSources:\n/);
  const citations = sources
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\[\d+\]/.test(line));
  return { answer: answer.trim(), citations };
}

function isPermissionDifferentiated(recipe, query) {
  return (
    recipe.demoQueries.find((q) => q.query === query)
      ?.permissionDifferentiated === true
  );
}

/**
 * Assert the recipe's own refusal guard, by calling answer() with no sources.
 *
 * Not driven through a live query on purpose. The obvious approach -- ask
 * something nothing can answer -- does not work: Glean search returns loose
 * matches rather than an empty set, so a deliberately nonsensical question came
 * back with six results on a real instance. There is no query that reliably
 * produces zero retrieval, so the empty case has to be induced directly. The
 * guard short-circuits before the LLM call, so this needs no model credential.
 */
async function assertRefusesWithoutSources(context) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/permissions-aware-retrieval/python',
  );
  // Use the interpreter uv already provisioned for the script, so the inline
  // PEP 723 dependencies are importable. `uv run python -c` gets a bare
  // environment instead and fails on the recipe's own imports.
  const { stdout: interpreter } = await execFileAsync(
    'uv',
    ['python', 'find', '--script', 'main.py'],
    { cwd },
  );
  const { stdout } = await execFileAsync(
    interpreter.trim(),
    ['-c', 'import main; print(main.answer("anything", []))'],
    { cwd, env: { ...process.env }, maxBuffer: 1024 * 1024 },
  );
  return REFUSAL.test(stdout)
    ? null
    : `answer() produced text instead of refusing when handed no sources — this is the fabrication the recipe exists to prevent: ${stdout.trim().slice(0, 160)}`;
}

export async function run(query, context) {
  // The permission-differentiated entry tells the reader to ask for something
  // they personally can't see. What that is depends on the instance, so assert
  // the property underneath it: no sources must mean no answer.
  if (isPermissionDifferentiated(context.recipe, query)) {
    return assertRefusesWithoutSources(context);
  }

  const result = await ask(context, query);
  if (!result.answer) return 'answer was empty';
  if (result.citations.length === 0) {
    return 'no citations — retrieval returned nothing for a question your content should answer';
  }
  for (const line of result.citations) {
    if (!/https?:\/\//.test(line)) return `citation has no real URL: ${line}`;
  }
  return null;
}
