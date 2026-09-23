import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Only inspect the runs the reviewer created. This gate never starts a run,
// submits a decision, posts to Slack, or deletes test artifacts.
export const sideEffects = 'read-only';
export const requiredEnv = [
  'GLEAN_SERVER_URL',
  'GLEAN_API_TOKEN',
  'GLEAN_AGENT_ID',
  'GLEAN_APPROVED_RUN_ID',
  'GLEAN_REJECTED_RUN_ID',
  'GLEAN_CANCELLED_RUN_ID',
];

const scenarios = [
  { variable: 'GLEAN_APPROVED_RUN_ID', state: 'SUCCEEDED' },
  { variable: 'GLEAN_REJECTED_RUN_ID', state: 'SUCCEEDED' },
  { variable: 'GLEAN_CANCELLED_RUN_ID', state: 'CANCELLED' },
];

export function checkSnapshot(snapshot, { agentId, runId, state }) {
  if (snapshot.agent_id !== agentId || snapshot.run_id !== runId) {
    return 'The snapshot agent/run identity does not match the recorded scenario.';
  }
  if (snapshot.state !== state) {
    return `Expected ${state}; observed ${snapshot.state}. Inspect the run before claiming this scenario passed.`;
  }
  if (
    !Array.isArray(snapshot.pending_interactions) ||
    snapshot.pending_interactions.length !== 0
  ) {
    return 'Expected no pending interactions on the terminal run.';
  }
  // A completed run alone cannot prove a particular decision, its replay
  // safety, or the number of Slack messages. Never report full verification.
  return {
    skip: 'API snapshot checks passed. Record the README live checks: no post before approval, actual Slack counts, rejection, cancellation, accepted replay, conflicting decisions, reconnect, and authorized wrong-owner/agent access. A terminal snapshot cannot prove those outcomes.',
  };
}

export async function run(query, context) {
  const index = context.recipe.demoQueries.findIndex(
    (entry) => entry.query === query,
  );
  const scenario = scenarios[index];
  if (!scenario)
    return 'No snapshot assertion for this demo query; extend the verifier.';
  const runId = process.env[scenario.variable];
  if (!runId) return `Set ${scenario.variable} from the live walkthrough.`;
  const runIds = scenarios.map(({ variable }) => process.env[variable]);
  if (new Set(runIds).size !== scenarios.length) {
    return 'Approve, reject, and cancel require three distinct run IDs.';
  }
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['dist/cli.js', 'status', '--run-id', runId],
      {
        cwd: path.join(context.repoRoot, 'recipes/human-in-the-loop-agent'),
        env: { ...process.env },
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    return checkSnapshot(JSON.parse(stdout).run, {
      agentId: process.env.GLEAN_AGENT_ID,
      runId,
      state: scenario.state,
    });
  } catch {
    // Never echo the subprocess output: it contains the agent's tool arguments.
    return 'The shipped status command failed or returned invalid JSON. Run it locally to inspect the error; no verification pass was recorded.';
  }
}
