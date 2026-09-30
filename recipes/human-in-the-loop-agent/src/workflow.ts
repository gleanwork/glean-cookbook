import { RecipeError } from './client.js';
import { describeApproval, safeForTerminal } from './review.js';
import {
  lastReply,
  pendingApproval,
  SAFE_ID,
  TERMINAL,
  type AgentRuns,
  type Decision,
  type Run,
} from './runs.js';

export interface Io {
  log: (line: string) => void;
  /**
   * Asks the person to decide. Resolves to a decision, 'CANCEL', or null to
   * leave the run waiting. Absent when there's no terminal to ask in.
   */
  ask?: (question: string) => Promise<Decision | 'CANCEL' | null>;
}

export interface Options {
  waitSeconds?: number;
  pollIntervalMs?: number;
  /** A decision made ahead of time, bound to one reviewed interaction ID. */
  decision?: { value: Decision; interactionId: string };
  /**
   * True when this invocation started the run, so it must see the approval
   * pause. A resumed run may already have been decided elsewhere.
   */
  expectPause?: boolean;
  /**
   * Flags to repeat in printed commands: the backend flag the person used
   * (for example `--email you@x.com`), plus `--show-json` if they passed it.
   */
  target?: string;
}

// Printed commands are meant to be copied into a shell. Server IDs are
// already checked in checkRun; this also covers the agent ID the person gave.
function id(value: string): string {
  if (!SAFE_ID.test(value)) {
    throw new RecipeError(
      `Glean returned an unexpected ID (${safeForTerminal(value)}). Nothing was sent.`,
    );
  }
  return value;
}

/** A complete command to run against this run, as the person would type it. */
export function command(
  runs: AgentRuns,
  subcommand: 'resume' | 'status' | 'cancel',
  runId: string,
  { target, extra = '' }: { target?: string; extra?: string } = {},
): string {
  return [
    'npm start --',
    subcommand,
    `--agent-id ${id(runs.agentId)}`,
    `--run-id ${id(runId)}`,
    extra,
    target ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function report(run: Run, io: Io): number {
  const reply = lastReply(run);
  if (reply) io.log(`Agent: ${safeForTerminal(reply)}`);
  if (run.state === 'SUCCEEDED' || run.state === 'CANCELLED') {
    io.log(`Run ${id(run.run_id)} ${run.state.toLowerCase()}.`);
    return 0;
  }
  const detail = run.error ? `: ${safeForTerminal(run.error.message)}` : '';
  io.log(`Run ${id(run.run_id)} ${run.state.toLowerCase()}${detail}`);
  return 1;
}

/**
 * Takes a run from wherever it is to a decision and then to the end.
 * Approval is only ever sent when the person chose it for the exact tool call
 * shown to them. Returns the process exit code: 0 finished, 1 failed or
 * misconfigured, 2 still waiting (nothing was lost; resume it).
 */
export async function drive(
  runs: AgentRuns,
  initial: Run,
  io: Io,
  {
    waitSeconds = 120,
    pollIntervalMs = 2000,
    decision,
    expectPause = false,
    target,
  }: Options = {},
): Promise<number> {
  const wait = (run: Run) =>
    runs.wait(run, { seconds: waitSeconds, intervalMs: pollIntervalMs });
  const resume = (runId: string, extra?: string) =>
    command(runs, 'resume', runId, { target, extra });

  let run = await wait(initial);
  let decided = false;

  while (!TERMINAL.has(run.state)) {
    const approval = pendingApproval(run);
    if (!approval) {
      io.log(
        `Run ${id(run.run_id)} is still ${run.state.toLowerCase()}. It keeps running; check it again with:`,
      );
      io.log(`  ${resume(run.run_id)}`);
      return 2;
    }
    if (decided) {
      // Each decision covers one reviewed call. A second pause is a new call
      // the person hasn't seen, so stop instead of carrying the decision over.
      throw new RecipeError(
        `The agent asked to run another tool. Review it with: ${resume(run.run_id)}`,
      );
    }

    io.log(
      '\nThe agent is waiting for your approval before it runs this tool:\n',
    );
    io.log(describeApproval(approval));
    io.log('');

    let choice: Decision | 'CANCEL' | null;
    if (decision) {
      if (decision.interactionId !== approval.interaction_id) {
        throw new RecipeError(
          `--interaction-id ${safeForTerminal(decision.interactionId)} is not the pending approval (${id(approval.interaction_id)}). Review the call above before deciding.`,
        );
      }
      choice = decision.value;
    } else if (io.ask) {
      choice = await io.ask(
        'Approve (a), reject (r), cancel the run (c), or press Enter to decide later: ',
      );
    } else {
      io.log('No terminal to ask in. To decide, run one of:');
      for (const value of ['approve', 'reject']) {
        io.log(
          `  ${resume(run.run_id, `--decision ${value} --interaction-id ${id(approval.interaction_id)}`)}`,
        );
      }
      return 2;
    }

    if (choice === null) {
      io.log('Left the run waiting. Nothing was sent. Pick it up later with:');
      io.log(`  ${resume(run.run_id)}`);
      return 2;
    }
    if (choice === 'CANCEL') {
      return report(await wait(await runs.cancel(run.run_id)), io);
    }

    io.log(
      choice === 'APPROVE'
        ? 'Approved. Running the tool…'
        : 'Rejected. The tool will not run.',
    );
    decided = true;
    run = await wait(
      await runs.respond(run.run_id, approval.interaction_id, choice),
    );
  }

  if (expectPause && !decided && run.state === 'SUCCEEDED') {
    // The whole point of the recipe is the pause. If a run we started never
    // paused, the tool wasn't attached or doesn't require confirmation.
    report(run, io);
    io.log(
      '\nThe run finished without asking for approval. In Agent Builder, check that Slack Actions is added with "Send Slack message to user", "Allow agent to use write tools without approval" is unchecked, and the agent is published.',
    );
    return 1;
  }
  return report(run, io);
}
