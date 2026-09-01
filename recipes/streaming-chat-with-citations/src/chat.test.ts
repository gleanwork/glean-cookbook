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

function sseResponse(payload: unknown) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: response\n'));
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
      );
      controller.close();
    },
  });

  return new HttpResponse(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

test('uses the modern Platform Chat SSE response with the SDK transport', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const bodies: JsonValue[] = [];
  const accepts: string[] = [];
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      bodies.push((await request.json()) as JsonValue);
      accepts.push(request.headers.get('accept') ?? '');
      return sseResponse(completedResponse());
    }),
  );

  await runChat({
    serverUrl: baseUrl,
    prompt: 'What is our policy?',
    stream: true,
  });

  assert.deepEqual(accepts, ['text/event-stream']);
  assert.deepEqual(bodies, [
    {
      input: 'What is our policy?',
      store: true,
      stream: true,
    },
  ]);
});

test('reuses conversation_id for a typed follow-up turn', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const bodies: JsonValue[] = [];
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      bodies.push((await request.json()) as JsonValue);
      return HttpResponse.json(completedResponse());
    }),
  );

  await runChat({
    serverUrl: baseUrl,
    prompt: 'What is our policy?',
    followUp: 'Who owns it?',
    stream: false,
  });

  assert.deepEqual(bodies, [
    {
      input: 'What is our policy?',
      store: true,
      stream: false,
    },
    {
      conversation_id: 'conv_fixture',
      input: 'Who owns it?',
      store: true,
      stream: false,
    },
  ]);
});
