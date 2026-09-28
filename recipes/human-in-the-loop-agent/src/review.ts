import type { Approval } from './runs.js';

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
