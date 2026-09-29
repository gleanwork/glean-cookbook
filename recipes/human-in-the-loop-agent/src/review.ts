import type { Approval, Run, RunCall } from './runs.js';

// Tool arguments come from the model, so treat them as untrusted text. Escape
// terminal control characters, and the bidirectional and zero-width
// characters that can make displayed text differ from what will be sent.
const UNSAFE =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;

export function safeForTerminal(text: string): string {
  return text.replace(
    UNSAFE,
    (char) => `\\u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );
}

/**
 * What the person approves: the tool and the exact arguments Glean stored for
 * this call. A decision can't edit them; reject and start again instead.
 *
 * The SDK parses arguments with JSON.parse, which rounds integers above 2^53.
 * That's fine for this recipe's text message. An approval screen for tools
 * that take large numeric IDs should show the raw response body instead.
 */
/**
 * A run as indented JSON that is safe to print. The escapes are valid JSON,
 * so the text still parses to the same run. It's the run as the SDK parsed
 * it: unknown fields are dropped and timestamps are normalized.
 */
export function runJson(run: Run): string {
  return safeForTerminal(JSON.stringify(run, null, 2));
}

const REQUESTS: Record<RunCall, string> = {
  createRun: 'POST /api/agents/{agent_id}/runs',
  getRun: 'GET /api/agents/{agent_id}/runs/{run_id}',
  respondToRun: 'POST /api/agents/{agent_id}/responses',
  cancelRun: 'POST /api/agents/{agent_id}/cancellations',
};

/**
 * For --show-json: prints each run Glean returns under the SDK call and HTTP
 * request that returned it. A poll that returns the run already printed is
 * skipped, so waiting doesn't repeat the same JSON every two seconds.
 */
export function printRuns(log: (text: string) => void) {
  let last: string | undefined;
  return (call: RunCall, run: Run) => {
    const json = runJson(run);
    if (call === 'getRun' && json === last) return;
    last = json;
    log(`\n${call}: ${REQUESTS[call]}\n${json}`);
  };
}

export function describeApproval(approval: Approval): string {
  const args = JSON.stringify(approval.arguments, null, 2);
  return [
    `Tool:        ${safeForTerminal(approval.display_name)}`,
    `What it does: ${safeForTerminal(approval.description)}`,
    'Arguments:',
    ...safeForTerminal(args)
      .split('\n')
      .map((line) => `  ${line}`),
  ].join('\n');
}
