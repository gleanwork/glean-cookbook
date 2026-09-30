import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { discardTypeAhead } from './prompt.js';
import meow from 'meow';
import { loadDotEnv, RecipeError, resolveSettings } from './client.js';
import { printCliError } from './errors.js';
import { printCalls, runJson } from './review.js';
import { AgentRuns, type Decision } from './runs.js';
import { command, drive, type Io } from './workflow.js';

const cli = meow(
  `
    Usage
      $ npm start -- --agent-id <id> --email <work-email> [--message <text>]
      $ npm start -- resume --agent-id <id> --run-id <id> --email <work-email>
      $ npm start -- status --agent-id <id> --run-id <id> --email <work-email>
      $ npm start -- cancel --agent-id <id> --run-id <id> --email <work-email>

    With no command, starts one durable run of your agent, waits for it to ask
    for approval, shows you the exact tool call, and sends your decision.

    Options
      --agent-id        Agent to run (default: GLEAN_AGENT_ID in .env)
      --message         Text for the agent to send you (default: a timestamped test message)
      --run-id          An existing run, for resume, status, or cancel
      --decision        approve or reject, for when there's no terminal to ask in
      --interaction-id  The pending approval the decision is for (printed by resume)
      --wait-seconds    How long to wait for each step (default: 120)
      --show-json       Also print each API request and response body, as JSON
      --email           Work email used to find your Glean backend
      --server-url      Complete Glean backend origin; overrides --email

    Example
      $ npm start -- --agent-id 3a2139bdf60540248c270d77887053f0 --email you@example.com
  `,
  {
    importMeta: import.meta,
    flags: {
      agentId: { type: 'string' },
      message: { type: 'string' },
      runId: { type: 'string' },
      decision: { type: 'string' },
      interactionId: { type: 'string' },
      waitSeconds: { type: 'number', default: 120 },
      showJson: { type: 'boolean', default: false },
      email: { type: 'string' },
      serverUrl: { type: 'string' },
    },
  },
);

// The run the CLI is currently watching, so Ctrl-C can say how to continue.
let watching: string | undefined;

async function ask(question: string) {
  // Only a keypress made after the review is on screen can decide.
  const earlier = await discardTypeAhead(stdin);
  if (earlier.interrupted) return null;
  if (earlier.typed) {
    console.log('(Ignored what was typed before this prompt.)');
  }
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await terminal.question(question)).trim().toLowerCase();
    if (answer === 'a' || answer === 'approve') return 'APPROVE' as const;
    if (answer === 'r' || answer === 'reject') return 'REJECT' as const;
    if (answer === 'c' || answer === 'cancel') return 'CANCEL' as const;
    // Anything else, including Enter, leaves the run waiting. Nothing is sent.
    return null;
  } catch (error) {
    // Ctrl-C at the prompt: readline rejects instead of raising SIGINT.
    // Treat it like Enter, so the person gets the command to continue.
    if ((error as Error).name === 'AbortError') return null;
    throw error;
  } finally {
    terminal.close();
  }
}

function runIdFlag() {
  const runId = cli.flags.runId?.trim();
  if (!runId) throw new RecipeError('--run-id is required for this command.');
  return runId;
}

function decisionFlag() {
  const decision = cli.flags.decision?.trim().toLowerCase();
  const interactionId = cli.flags.interactionId?.trim();
  if (!decision && !interactionId) return undefined;
  if (!decision || !interactionId) {
    throw new RecipeError('--decision and --interaction-id go together.');
  }
  if (decision !== 'approve' && decision !== 'reject') {
    throw new RecipeError('--decision must be approve or reject.');
  }
  return { value: decision.toUpperCase() as Decision, interactionId };
}

/** The backend flag the person passed, as they passed it. */
function backendFlag() {
  const serverUrl = cli.flags.serverUrl?.trim();
  if (serverUrl) return `--server-url ${JSON.stringify(serverUrl)}`;
  const email = cli.flags.email?.trim();
  return email ? `--email ${JSON.stringify(email)}` : undefined;
}

/** Flags to repeat in printed commands, so a copied command keeps the same view. */
function targetFlags() {
  const flags = [backendFlag(), cli.flags.showJson ? '--show-json' : ''];
  return flags.filter(Boolean).join(' ') || undefined;
}

async function main(): Promise<number> {
  const [subcommand, extra] = cli.input;
  if (extra) throw new RecipeError(`Unexpected argument: ${extra}`);
  if (subcommand && !['resume', 'status', 'cancel'].includes(subcommand)) {
    throw new RecipeError(`Unknown command: ${subcommand}. See --help.`);
  }
  if (!(cli.flags.waitSeconds > 0)) {
    throw new RecipeError('--wait-seconds must be greater than zero.');
  }
  if (!subcommand && (cli.flags.runId || cli.flags.decision)) {
    throw new RecipeError(
      'To continue an existing run, use: npm start -- resume --agent-id <id> --run-id <id>',
    );
  }
  const decision = decisionFlag();

  loadDotEnv();
  const runs = new AgentRuns(
    await resolveSettings({
      agentId: cli.flags.agentId,
      email: cli.flags.email,
      serverUrl: cli.flags.serverUrl,
    }),
    {
      // status already prints the run as JSON.
      onCall:
        cli.flags.showJson && subcommand !== 'status'
          ? printCalls((text) => console.log(text))
          : undefined,
    },
  );
  const io: Io = {
    log: (line) => console.log(line),
    ask: stdin.isTTY ? ask : undefined,
  };
  const target = targetFlags();
  const options = { waitSeconds: cli.flags.waitSeconds, decision, target };

  process.once('SIGINT', () => {
    console.error(
      watching
        ? `\nStopped watching. The run was not cancelled. Continue with:\n  ${command(runs, 'resume', watching, { target })}`
        : '\nStopped.',
    );
    process.exit(130);
  });

  switch (subcommand) {
    case 'status':
      // Machine-readable, for scripts and the repository verifier.
      console.log(runJson(await runs.get(runIdFlag())));
      return 0;
    case 'cancel': {
      const run = await runs.cancel(runIdFlag());
      console.log(
        `Cancellation requested. Run ${run.run_id} is ${run.state.toLowerCase()}.`,
      );
      return 0;
    }
    case 'resume': {
      watching = runIdFlag();
      return drive(runs, await runs.get(watching), io, options);
    }
    default: {
      const message =
        cli.flags.message?.trim() ||
        `Cookbook approval test ${new Date().toISOString()}`;
      const run = await runs.start(message);
      watching = run.run_id;
      console.log(`Started run ${run.run_id}. Waiting for the agent…`);
      return drive(runs, run, io, { ...options, expectPause: true });
    }
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    printCliError(error);
    process.exitCode = 1;
  },
);
