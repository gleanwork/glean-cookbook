import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  GleanBaseError,
  HTTPClientError,
} from '@gleanwork/api-client/models/errors';
import { loadDotEnv, RecipeError, resolveSettings } from './client.js';
import { AgentRuns, outcome, show, watch, type Snapshot } from './runs.js';

const HELP = `Usage: npm start -- <command> --email <work-email> [options]

  start    [--message TEXT]                 Create one durable run (never retried).
  status   --run-id ID                      Inspect an existing run.
  watch    --run-id ID [--wait-seconds 120]  Poll until approval, completion, or deadline.
  approve  --run-id ID --interaction-id ID   Approve only the invocation you reviewed.
  reject   --run-id ID --interaction-id ID   Reject only the invocation you reviewed.
  cancel   --run-id ID                      Request cancellation (not rollback).

Every command finds your Glean backend from --email. Use --server-url or
GLEAN_SERVER_URL instead if discovery is unavailable. Sign in first with
npm run login -- --email <work-email>. GLEAN_AGENT_ID and GLEAN_MESSAGE come
from .env; --message overrides GLEAN_MESSAGE.

An explicit approval replay must use the exact original run and interaction IDs.
`;

export function parseCommand(args: string[]) {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        'run-id': { type: 'string' },
        'interaction-id': { type: 'string' },
        message: { type: 'string' },
        'wait-seconds': { type: 'string' },
        email: { type: 'string' },
        'server-url': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch {
    throw new RecipeError('Invalid options. Run npm start -- --help.');
  }
  const { values, positionals } = parsed;
  if (values.help) return { command: 'help' as const, target: {} };
  const command = positionals[0];
  if (
    positionals.length !== 1 ||
    !command ||
    !['start', 'status', 'watch', 'approve', 'reject', 'cancel'].includes(
      command,
    )
  ) {
    throw new RecipeError(
      'Choose start, status, watch, approve, reject, or cancel. See --help.',
    );
  }
  function value(name: string): string | undefined {
    const input = values[name];
    if (input === undefined) return undefined;
    if (typeof input !== 'string' || !input.trim())
      throw new RecipeError(`--${name} must not be blank.`);
    return input;
  }
  const runId = value('run-id');
  const interactionId = value('interaction-id');
  const message = value('message');
  const seconds = value('wait-seconds');
  if (command !== 'start' && !runId)
    throw new RecipeError('--run-id is required.');
  if (['approve', 'reject'].includes(command) && !interactionId)
    throw new RecipeError('--interaction-id is required.');
  if (
    (command === 'start' && runId) ||
    (!['approve', 'reject'].includes(command) && interactionId) ||
    (command !== 'start' && message !== undefined) ||
    (command !== 'watch' && seconds !== undefined)
  ) {
    throw new RecipeError(
      'An option does not apply to this command. See --help.',
    );
  }
  const waitSeconds = seconds === undefined ? 120 : Number(seconds);
  if (!Number.isFinite(waitSeconds) || waitSeconds <= 0)
    throw new RecipeError(
      '--wait-seconds must be finite and greater than zero.',
    );
  const target = { email: value('email'), serverUrl: value('server-url') };
  return { command, runId, interactionId, message, waitSeconds, target };
}

export function errorMessage(error: unknown): string {
  if (error instanceof RecipeError) return error.message;
  if (error instanceof GleanBaseError) {
    const guidance: Record<number, string> = {
      401: 'Sign in again with npm run login -- --email <work-email>, as the same user who owns the run.',
      403: "Sign in with agents.run (npm run login) and check the user's access to the agent.",
      404: 'Check deployment, IDs, run ownership, and current agent access.',
      409: 'State conflict. Read status; do not replace an old ID and silently reapprove.',
      422: "Complete the agent's tool authentication in Glean before starting a new run.",
      429: 'Rate limited. Wait before polling again; do not blindly retry a write.',
      503: 'Service unavailable. Inspect the same run before deciding whether to retry.',
    };
    return `HTTP ${error.statusCode}. ${guidance[error.statusCode] ?? 'Inspect the same run and API contract; do not blindly retry a write.'}`;
  }
  if (error instanceof HTTPClientError) {
    return 'Network/request error; the write outcome may be unknown. Do not repeat start. Inspect the saved run ID, or reconcile in Glean before creating another run.';
  }
  // SDK validation errors and arbitrary errors can embed sensitive payloads.
  return 'Invalid response or local error. Inspect the contract and configuration. No write was retried.';
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const command = parseCommand(args);
    if (command.command === 'help') {
      console.log(HELP);
      return 0;
    }
    loadDotEnv();
    const runs = new AgentRuns(await resolveSettings(command.target));
    let snapshot: Snapshot;
    switch (command.command) {
      case 'watch':
        return await watch(runs, command.runId!, command.waitSeconds);
      case 'start':
        snapshot = await runs.start(
          command.message ?? process.env.GLEAN_MESSAGE ?? '',
        );
        break;
      case 'status':
        snapshot = await runs.get(command.runId!);
        break;
      case 'cancel':
        snapshot = await runs.cancel(command.runId!);
        break;
      case 'approve':
      case 'reject':
        snapshot = await runs.respond(
          command.runId!,
          command.interactionId!,
          command.command === 'approve' ? 'APPROVE' : 'REJECT',
        );
        break;
      default:
        throw new RecipeError('Unsupported command. Run npm start -- --help.');
    }
    show(snapshot);
    return outcome(snapshot.run);
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.once('SIGINT', () => {
    console.error(
      'Client stopped. The run was NOT cancelled. Reuse its ID to watch or cancel.',
    );
    process.exit(130);
  });
  process.exitCode = await main();
}
