// The claim is governance, not just retrieval: a caller on the tool's allow-list
// must actually get a ticket filed (a real 200 with an id), and a caller who
// isn't must get a graceful read-only fallback rather than the whole run failing.
// Both halves matter -- a run that only ever succeeds proves the check never ran.
//
// The recipe no longer impersonates anyone: the agent runs as whoever the
// credential belongs to, and Glean forwards that identity to the tool as
// Glean-User-Email. So the two branches are exercised by controlling the tool
// server's own allow-list, which is a local process this module owns, instead of
// by needing a global/admin token and two real accounts.
//
// The agent id comes from Agent Builder and the tool registration from Admin >
// Platform > Tools; neither is scriptable, so both remain required fixtures.

import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TOOL_PORT = Number(process.env.TOOL_SERVER_PORT ?? 8080);

// Tickets are filed against a local Flask server, never a real system. On the
// instance it invokes an existing agent, so the run is recorded as activity.
export const sideEffects = 'agent-run';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_INSTANCE',
  'GLEAN_AGENT_ID',
];

// Synthetic identities for the boundary check. The permitted one goes on the
// server's allow-list; the denied one deliberately does not. Neither needs to
// exist in Glean -- the tool server's authorization is its own.
const PERMITTED = 'allowed@verify.invalid';
const DENIED = 'not-allowed@verify.invalid';

export async function setup(context) {
  // Refuse to adopt a server we did not start. A leftover process from an
  // earlier run holds the port, our own spawn fails to bind, and every
  // assertion below then silently measures the stranger's allow-list instead of
  // ours -- reporting a governance failure that has nothing to do with the
  // recipe. Not hypothetical: it happened while building this module.
  let portInUse = false;
  try {
    await fetch(`http://127.0.0.1:${TOOL_PORT}/`);
    portInUse = true;
  } catch {
    // Connection refused is the wanted outcome: nothing is listening.
  }
  if (portInUse) {
    throw new Error(
      `something is already listening on ${TOOL_PORT}. Stop it first ` +
        `(lsof -ti:${TOOL_PORT} | xargs kill) — this gate sets the tool ` +
        `server's allow-list, so it cannot use one it did not configure.`,
    );
  }

  const cwd = path.join(
    context.repoRoot,
    'recipes/multi-step-agent/tool-server',
  );
  const server = spawn('uv', ['run', '--locked', 'server.py'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AUTHORIZED_EMAILS: PERMITTED },
    // Own the whole group: `uv run` spawns python as a child, so killing only
    // the uv process leaves the server listening and poisons the next run.
    detached: true,
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      // Any response, including 404/405, proves it's listening.
      await fetch(`http://127.0.0.1:${TOOL_PORT}/`);
      return { server };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  killGroup(server);
  throw new Error(`tool server did not listen on ${TOOL_PORT} within 30s`);
}

/** Kill the process group, not just `uv`, so no child survives teardown. */
function killGroup(server) {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}

export async function teardown(context) {
  killGroup(context.server);
}

/** The tool server is the governance boundary, so assert against it directly. */
async function fileTicket(userEmail) {
  const response = await fetch(
    `http://127.0.0.1:${TOOL_PORT}/file_incident_ticket`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The header Glean sends a custom tool, carrying the run's identity.
        'Glean-User-Email': userEmail,
      },
      body: JSON.stringify({
        summary: 'verify: open incidents',
        description: 'filed by scripts/verify-recipe.mjs',
      }),
    },
  );
  return { status: response.status, body: await response.json() };
}

async function invokeAgent(query, context) {
  const { stdout } = await execFileAsync('uv', ['run', '--locked', 'main.py'], {
    cwd: path.join(context.repoRoot, 'recipes/multi-step-agent/invoke-agent'),
    env: { ...process.env, VERIFY_QUERY: query },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

export async function run(query, context) {
  const permitted = await fileTicket(PERMITTED);
  if (permitted.status !== 200) {
    return (
      `a caller on the allow-list got ${permitted.status} from the governed tool; ` +
      `expected 200 with a ticket id: ${JSON.stringify(permitted.body)}`
    );
  }
  if (!permitted.body.resultURL) {
    return `tool returned 200 but no resultURL: ${JSON.stringify(permitted.body)}`;
  }

  const denied = await fileTicket(DENIED);
  if (denied.status !== 403) {
    return (
      `a caller off the allow-list got ${denied.status}; expected 403. The ` +
      `governance check is not running, so a restricted capability is open to everyone`
    );
  }

  // With the boundary proven, confirm the agent actually reaches it and degrades
  // rather than erroring when the tool refuses.
  try {
    const output = await invokeAgent(query, context);
    if (/traceback|unhandled|fatal/i.test(output)) {
      return `agent run crashed instead of completing:\n${output.slice(0, 400)}`;
    }
  } catch (error) {
    return (
      `agent run failed outright; the recipe promises a read-only fallback when ` +
      `the tool refuses, not a hard failure: ${error.message}`
    );
  }
  return null;
}
