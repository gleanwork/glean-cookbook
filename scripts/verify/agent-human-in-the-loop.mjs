// Read-only live preflight. The full HITL verification requires a person to inspect
// the actual tool arguments and external destination. A current snapshot cannot
// prove an earlier pause, a rejected side effect, or an exactly-once external post.
// Never turn those missing observations into passes or auto-approve to get green.
export const sideEffects = 'read-only';
export const requiredEnv = [
  'GLEAN_SERVER_URL',
  'GLEAN_API_TOKEN',
  'GLEAN_AGENT_ID',
  'GLEAN_HITL_RUN_ID',
];

export async function setup() {
  const origin = new URL(process.env.GLEAN_SERVER_URL);
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('Use the complete backend HTTPS origin.');
  }
  for (const name of ['GLEAN_AGENT_ID', 'GLEAN_HITL_RUN_ID']) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(process.env[name] ?? ''))
      throw new Error(`Invalid ${name}.`);
  }
  const response = await fetch(
    `${origin.origin}/api/agents/${process.env.GLEAN_AGENT_ID}/runs/${process.env.GLEAN_HITL_RUN_ID}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Live GET failed with HTTP ${response.status}; no run was created or modified by this verifier.`,
    );
  const snapshot = await response.json();
  if (
    snapshot.run?.run_id !== process.env.GLEAN_HITL_RUN_ID ||
    snapshot.run?.agent_id !== process.env.GLEAN_AGENT_ID ||
    typeof snapshot.request_id !== 'string'
  ) {
    throw new Error(
      'Live GET did not return the requested persisted run snapshot.',
    );
  }
  return { snapshot };
}

export async function run(query, context) {
  const index = context.recipe.demoQueries.findIndex(
    (item) => item.query === query,
  );
  if (index < 0 || context.recipe.demoQueries.length !== 6)
    return 'Update the verifier when changing acceptance scenarios.';
  if (index === 0) {
    const run = context.snapshot.run;
    if (run.state !== 'REQUIRES_INPUT' || !run.pending_interactions?.length) {
      return 'Supply a currently paused HITL run in GLEAN_HITL_RUN_ID. A terminal run cannot prove review-before-execution.';
    }
    for (const item of run.pending_interactions) {
      if (
        item.type !== 'TOOL_APPROVAL' ||
        !item.interaction_id ||
        typeof item.display_name !== 'string' ||
        !item.arguments ||
        typeof item.arguments !== 'object' ||
        Array.isArray(item.arguments)
      ) {
        return 'Pending interactions do not contain the expected invocation-scoped review fields.';
      }
    }
  }
  return {
    skip: `BLOCKED: live snapshot retrieval is available, but "${query}" requires the authorized reader-pass observations in recipes/agent-human-in-the-loop/VERIFICATION.md. This read-only preflight cannot prove external effects and will not approve, reject, cancel, or create runs.`,
  };
}
