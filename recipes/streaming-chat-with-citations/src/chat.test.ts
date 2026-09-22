import assert from 'node:assert/strict';
import { afterAll, afterEach, beforeAll, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

process.env.NO_COLOR = '1';
const { runChat } = await import('./chat.js');

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

interface CitationFixture {
  snippet: string;
  title: string;
  url: string;
}

const defaultCitation: CitationFixture = {
  snippet: 'A useful policy excerpt.',
  title: 'Policy guide',
  url: 'https://glean.example.com/doc/fixture',
};

function completedResponse(
  conversationId = 'conv_fixture',
  citation: CitationFixture = defaultCitation,
) {
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
                    title: citation.title,
                    url: citation.url,
                  },
                ],
                snippets: [{ text: citation.snippet }],
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

function typedSseResponse(
  conversationId = 'conv_fixture',
  citation: CitationFixture = defaultCitation,
) {
  const encoder = new TextEncoder();
  const completed = completedResponse(conversationId, citation);
  const frames =
    [
      ...['The answer is ', 'grounded in your content.'].map((delta) =>
        [
          'event: RESPONSE_OUTPUT_TEXT_DELTA',
          `data: ${JSON.stringify({
            type: 'RESPONSE_OUTPUT_TEXT_DELTA',
            response_id: completed.id,
            delta,
          })}`,
          '',
        ].join('\n'),
      ),
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

function captureOutput(isTTY = false) {
  const chunks: string[] = [];
  return {
    chunks,
    output: {
      columns: 80,
      isTTY,
      write(chunk: string) {
        chunks.push(chunk);
      },
    },
  };
}

test('streams typed createStream events and writes raw deltas once', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const bodies: JsonValue[] = [];
  const { chunks, output } = captureOutput();
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      assert.equal(request.headers.get('x-glean-include-experimental'), null);
      bodies.push((await request.json()) as JsonValue);
      return typedSseResponse();
    }),
  );

  await runChat(
    {
      format: 'markdown',
      serverUrl: baseUrl,
      prompt: 'What is our policy?',
    },
    output,
  );

  assert.deepEqual(chunks, [
    'The answer is ',
    'grounded in your content.',
    '\n',
    '\nSources:\n' +
      '  1. Policy guide\n' +
      '     https://glean.example.com/doc/fixture\n' +
      '     A useful policy excerpt.\n',
  ]);
  assert.equal(
    chunks.join('').split('The answer is grounded in your content.').length - 1,
    1,
  );
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
  const { chunks, output } = captureOutput();
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      assert.equal(request.headers.get('x-glean-include-experimental'), null);
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

  await runChat(
    {
      format: 'markdown',
      serverUrl: baseUrl,
      prompt: 'What is our policy?',
      followUp: 'Who owns it?',
    },
    output,
  );

  assert.equal(
    chunks.join('').split('The answer is grounded in your content.').length - 1,
    2,
  );
  assert.match(chunks.join(''), /Follow-up:/);
  assert.equal(chunks.join('').split('Sources:').length - 1, 2);
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
