import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseSseData, parseSseFrame, readSseEvents } from './sse.js';

function streamFromChunks(chunks: Uint8Array[]) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}

test('parses fields and multiple data lines in one SSE frame', () => {
  const event = parseSseFrame(
    'event: response\nid: 7\ndata: {"text":"hello"}\ndata: {"more":true}',
  );

  assert.deepEqual(event, {
    event: 'response',
    id: '7',
    data: '{"text":"hello"}\n{"more":true}',
  });
});

test('reads events across arbitrary UTF-8 and frame boundaries', async () => {
  const source = 'data: {"text":"Hello 🌎"}\n\ndata: [DONE]\n\n';
  const encoded = new TextEncoder().encode(source);
  const splitAt = source.indexOf('🌎');
  const first = new TextEncoder().encode(source.slice(0, splitAt));
  const emoji = new TextEncoder().encode('🌎');
  const rest = new TextEncoder().encode(source.slice(splitAt + 2));
  const events = [];

  for await (const event of readSseEvents(
    streamFromChunks([
      first,
      emoji.slice(0, 1),
      emoji.slice(1),
      rest.slice(0, encoded.length > 0 ? 3 : 0),
      rest.slice(3),
    ]),
  )) {
    events.push(event);
  }

  assert.equal(events.length, 2);
  assert.deepEqual(parseSseData<{ text: string }>(events[0]!), {
    text: 'Hello 🌎',
  });
  assert.equal(parseSseData(events[1]!), undefined);
});
