import type { ReadStream } from 'node:tty';

/** The parts of a terminal input stream this module uses. */
export type TerminalInput = Pick<
  ReadStream,
  'setRawMode' | 'on' | 'off' | 'resume' | 'pause' | 'isRaw'
>;

export interface Discarded {
  /** Some input was typed before the prompt and thrown away. */
  typed: boolean;
  /** That input included Ctrl-C. */
  interrupted: boolean;
}

/**
 * Throws away anything typed while the CLI was waiting for the agent.
 *
 * A terminal keeps what you type until a program reads it. Without this, a
 * line typed during the wait (say "a" and Enter) would become the answer the
 * moment the prompt opened, approving a tool call nobody had seen. Raw mode
 * hands over buffered input right away, including a partial line with no
 * Enter, so a short read before the prompt empties the buffer.
 */
export async function discardTypeAhead(
  input: TerminalInput,
  windowMs = 150,
): Promise<Discarded> {
  const result: Discarded = { typed: false, interrupted: false };
  const onData = (chunk: Buffer | string) => {
    result.typed = true;
    // In raw mode Ctrl-C arrives as a byte instead of raising SIGINT.
    if (chunk.toString().includes('\u0003')) result.interrupted = true;
  };
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.on('data', onData);
  input.resume();
  try {
    await new Promise((resolve) => setTimeout(resolve, windowMs));
  } finally {
    input.off('data', onData);
    input.pause();
    input.setRawMode(wasRaw);
  }
  return result;
}
