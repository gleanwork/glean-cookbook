import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  GleanBaseError,
  HTTPClientError,
} from '@gleanwork/api-client/models/errors';
import {
  AgentRuns,
  outcome,
  RecipeError,
  settings,
  show,
  watch,
} from './runs.js';

const HELP = `Usage: npm start -- <command> [options]

  start    [--message TEXT]                 Create one durable run (never retried).
  status   --run-id ID                      Inspect an existing run.
  watch    --run-id ID [--wait-seconds 120]  Poll until approval, completion, or deadline.
  approve  --run-id ID --interaction-id ID   Approve only the invocation you reviewed.
  reject   --run-id ID --interaction-id ID   Reject only the invocation you reviewed.
  cancel   --run-id ID                      Request cancellation (not rollback).

Use GLEAN_MESSAGE in .env if --message is omitted. Run npm test for offline tests.
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
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch {
    throw new RecipeError('Invalid options. Run npm start -- --help.');
  }
  const { values, positionals } = parsed;
  if (values.help) return { command: 'help' as const };
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
  return { command, runId, interactionId, message, waitSeconds };
}

export function errorMessage(error: unknown): string {
  if (error instanceof RecipeError) return error.message;
  if (error instanceof GleanBaseError) {
    const guidance: Record<number, string> = {
      401: 'Sign in again; use the same user who owns the run.',
      403: "Check agents.run scope and the user's access to the agent.",
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
    try {
      // dist/cli.js stays one level below .env, even outside the cookbook repo.
      loadEnvFile(new URL('../.env', import.meta.url));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;
    }
    const runs = new AgentRuns(settings());
    if (command.command === 'watch')
      return await watch(runs, command.runId!, command.waitSeconds);
    const snapshot =
      command.command === 'start'
        ? await runs.start(command.message ?? process.env.GLEAN_MESSAGE ?? '')
        : command.command === 'status'
          ? await runs.get(command.runId!)
          : command.command === 'cancel'
            ? await runs.cancel(command.runId!)
            : await runs.respond(
                command.runId!,
                command.interactionId!,
                command.command === 'approve' ? 'APPROVE' : 'REJECT',
              );
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
