import assert from 'node:assert/strict';
import { afterAll, afterEach, beforeAll, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { runChat } from './chat.js';

const originalToken = process.env.GLEAN_API_TOKEN;
const baseUrl = 'https://fixture.glean.example.com';
const server = setupServer();

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
});

afterAll(() => {
  server.close();
});

function completedResponse(conversationId = 'conv_fixture') {
  return {
    id: 'resp_fixture',
    object: 'RESPONSE',
    created_at: '2026-09-01T00:00:00.000Z',
    status: 'COMPLETED',
    output: [
      {
        type: 'MESSAGE',
        role: 'ASSISTANT',
        content: [
          {
            type: 'OUTPUT_TEXT',
            text: 'The answer is grounded in your content.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  {
                    type: 'DOCUMENT',
                    document_id: 'doc_fixture',
                    title: 'Policy guide',
                    url: 'https://glean.example.com/doc/fixture',
                  },
                ],
                snippets: [{ text: 'A useful policy excerpt.' }],
              },
            ],
          },
        ],
      },
    ],
    store: true,
    conversation_id: conversationId,
    request_id: 'request_fixture',
  };
}

function typedSseResponse(conversationId = 'conv_fixture') {
  const encoder = new TextEncoder();
  const completed = completedResponse(conversationId);
  const frames =
    [
      [
        'event: RESPONSE_OUTPUT_TEXT_DELTA',
        `data: ${JSON.stringify({
          type: 'RESPONSE_OUTPUT_TEXT_DELTA',
          response_id: completed.id,
          delta: 'The answer is grounded in your content.',
        })}`,
        '',
      ].join('\n'),
      [
        'event: RESPONSE_COMPLETED',
        `data: ${JSON.stringify({
          type: 'RESPONSE_COMPLETED',
          response_id: completed.id,
          response: completed,
        })}`,
        '',
      ].join('\n'),
    ].join('\n') + '\n';

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frames));
      controller.close();
    },
  });

  return new HttpResponse(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

test('streams typed createStream events', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const bodies: JsonValue[] = [];
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      bodies.push((await request.json()) as JsonValue);
      return typedSseResponse();
    }),
  );

  await runChat({
    serverUrl: baseUrl,
    prompt: 'What is our policy?',
  });

  assert.deepEqual(bodies, [
    {
      input: 'What is our policy?',
      store: true,
      stream: true,
    },
  ]);
});

test('reuses conversation_id for a streamed follow-up turn', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const bodies: JsonValue[] = [];
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      const body = (await request.json()) as JsonValue;
      bodies.push(body);
      const conversationId =
        typeof body === 'object' &&
        body !== null &&
        'conversation_id' in body &&
        typeof body.conversation_id === 'string'
          ? body.conversation_id
          : 'conv_fixture';
      return typedSseResponse(conversationId);
    }),
  );

  await runChat({
    serverUrl: baseUrl,
    prompt: 'What is our policy?',
    followUp: 'Who owns it?',
  });

  assert.deepEqual(bodies, [
    {
      input: 'What is our policy?',
      store: true,
      stream: true,
    },
    {
      conversation_id: 'conv_fixture',
      input: 'Who owns it?',
      store: true,
      stream: true,
    },
  ]);
});
