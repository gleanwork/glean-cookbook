import type { Approval, Exchange, Run, RunCall } from './runs.js';

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
 * Indented JSON that is safe to print. The escapes are valid JSON, so the
 * text still parses to the same value. SDK objects print as the SDK parsed
 * them: unknown fields are dropped and timestamps are normalized.
 */
export function jsonForTerminal(value: unknown): string {
  return safeForTerminal(JSON.stringify(value, null, 2));
}

/** The run alone, as `status` prints it. */
export function runJson(run: Run): string {
  return jsonForTerminal(run);
}

const REQUESTS: Record<RunCall, string> = {
  createRun: 'POST /api/agents/{agent_id}/runs',
  getRun: 'GET /api/agents/{agent_id}/runs/{run_id}',
  respondToRun: 'POST /api/agents/{agent_id}/responses',
  cancelRun: 'POST /api/agents/{agent_id}/cancellations',
};

/**
 * For --show-json: prints each call's HTTP request, the body it sent, and the
 * response Glean returned. A poll that returns the run already printed is
 * skipped, so waiting doesn't repeat the same JSON every two seconds.
 */
export function printCalls(log: (text: string) => void) {
  let last: string | undefined;
  return ({ call, request, response, run }: Exchange) => {
    const json = runJson(run);
    if (call === 'getRun' && json === last) return;
    last = json;
    log(
      [
        `\n${call}: ${REQUESTS[call]}`,
        ...(request ? ['Request body:', jsonForTerminal(request)] : []),
        'Response body:',
        jsonForTerminal(response),
      ].join('\n'),
    );
  };
}

/**
 * What the person approves: the tool and the exact arguments Glean stored for
 * this call. A decision can't edit them; reject and start again instead.
 *
 * The SDK parses arguments with JSON.parse, which rounds integers above 2^53.
 * That's fine for this recipe's text message. An approval screen for tools
 * that take large numeric IDs should show the raw response body instead.
 */
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
