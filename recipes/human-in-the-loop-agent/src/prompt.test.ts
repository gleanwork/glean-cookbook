import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import { discardTypeAhead, type TerminalInput } from './prompt.js';

/** A terminal whose buffered keystrokes arrive as soon as it's read. */
function terminal(buffered: string[] = []) {
  const events = new EventEmitter();
  const state = { isRaw: false, rawModes: [] as boolean[], reading: false };
  const input = {
    get isRaw() {
      return state.isRaw;
    },
    setRawMode(mode: boolean) {
      state.isRaw = mode;
      state.rawModes.push(mode);
      return input;
    },
    on: (event: string, listener: (chunk: Buffer) => void) => {
      events.on(event, listener);
      return input;
    },
    off: (event: string, listener: (chunk: Buffer) => void) => {
      events.off(event, listener);
      return input;
    },
    resume() {
      state.reading = true;
      for (const keys of buffered.splice(0)) {
        queueMicrotask(() => events.emit('data', Buffer.from(keys)));
      }
      return input;
    },
    pause() {
      state.reading = false;
      return input;
    },
  } as unknown as TerminalInput;
  return { input, state, listeners: () => events.listenerCount('data') };
}

describe('input typed before the prompt', () => {
  test('a line typed during the wait is thrown away, not used as the answer', async () => {
    const t = terminal(['a\r']);
    expect(await discardTypeAhead(t.input, 5)).toEqual({
      typed: true,
      interrupted: false,
    });
  });

  test('Ctrl-C during the wait is reported so the run is left waiting', async () => {
    const t = terminal(['\u0003']);
    expect((await discardTypeAhead(t.input, 5)).interrupted).toBe(true);
  });

  test('nothing typed, nothing reported', async () => {
    const t = terminal();
    expect(await discardTypeAhead(t.input, 5)).toEqual({
      typed: false,
      interrupted: false,
    });
  });

  test('the terminal is left as it was for the prompt that follows', async () => {
    const t = terminal(['x']);
    await discardTypeAhead(t.input, 5);
    expect(t.state.rawModes).toEqual([true, false]);
    expect(t.state.reading).toBe(false);
    expect(t.listeners()).toBe(0);
  });
});
