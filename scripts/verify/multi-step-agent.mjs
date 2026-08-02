// The claim is governance, not just retrieval: a permitted user's request must
// actually file a ticket (a real 200 with an id), and a non-permitted user must
// get a graceful read-only fallback rather than the whole run failing. Both
// halves matter -- a run that only ever succeeds proves the check never ran.
//
// The agent id comes from Agent Builder and the tool registration from Admin >
// Platform > Tools; neither is scriptable, so both are required fixtures.

import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TOOL_PORT = Number(process.env.TOOL_SERVER_PORT ?? 8080);

// Tickets are filed against a local Flask server, never a real system. On the instance it invokes an existing agent, so same caveat as a2a-client.
export const sideEffects = 'agent-run';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_INSTANCE',
  'GLEAN_AGENT_ID',
  'VERIFY_USER_WITH_ACCESS',
  'VERIFY_USER_WITHOUT_ACCESS',
];

export async function setup(context) {
  const cwd = path.join(
    context.repoRoot,
    'recipes/multi-step-agent/tool-server',
  );
  const server = spawn('uv', ['run', '--locked', 'server.py'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
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
  server.kill();
  throw new Error(`tool server did not listen on ${TOOL_PORT} within 30s`);
}

export async function teardown(context) {
  context.server?.kill();
}

async function invokeAgent(query, actAs) {
  const { stdout } = await execFileAsync('uv', ['run', '--locked', 'main.py'], {
    cwd: path.join(process.cwd(), 'recipes/multi-step-agent/invoke-agent'),
    env: { ...process.env, VERIFY_QUERY: query, VERIFY_ACT_AS: actAs },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

/** The tool server is the governance boundary, so assert against it directly. */
async function fileTicket(actAs) {
  const response = await fetch(
    `http://127.0.0.1:${TOOL_PORT}/file_incident_ticket`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Glean-User-Email': actAs,
      },
      body: JSON.stringify({
        summary: 'verify: open incidents',
        description: 'filed by scripts/verify-recipe.mjs',
      }),
    },
  );
  return { status: response.status, body: await response.json() };
}

export async function run(query, context) {
  const permitted = await fileTicket(process.env.VERIFY_USER_WITH_ACCESS);
  if (permitted.status !== 200) {
    return (
      `permitted user got ${permitted.status} from the governed tool; expected ` +
      `200 with a ticket id: ${JSON.stringify(permitted.body)}`
    );
  }
  if (!permitted.body.resultURL) {
    return `tool returned 200 but no resultURL: ${JSON.stringify(permitted.body)}`;
  }

  const denied = await fileTicket(process.env.VERIFY_USER_WITHOUT_ACCESS);
  if (denied.status !== 403) {
    return (
      `non-permitted user got ${denied.status}; expected 403. The governance ` +
      `check is not running, so a permitted-only capability is open to everyone`
    );
  }

  // With the boundary proven, confirm the agent actually reaches it and degrades
  // rather than erroring for the denied user.
  try {
    const output = await invokeAgent(
      query,
      process.env.VERIFY_USER_WITHOUT_ACCESS,
    );
    if (/traceback|unhandled|fatal/i.test(output)) {
      return `agent run crashed for the non-permitted user instead of falling back:\n${output.slice(0, 400)}`;
    }
  } catch (error) {
    return (
      `agent run failed outright for the non-permitted user; the recipe promises ` +
      `a read-only fallback, not a hard failure: ${error.message}`
    );
  }
  return null;
}
