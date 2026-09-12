import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  askChat,
  ChatUnfinishedError,
  parsePlatformChatResponse,
} from './chat.ts';

const baseUrl = 'https://fixture.glean.example.com';
const server = setupServer();

before(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

after(() => {
  server.close();
});

const originalEnv = {
  X_GLEAN_INCLUDE_EXPERIMENTAL: process.env.X_GLEAN_INCLUDE_EXPERIMENTAL,
  GLEAN_API_TOKEN: process.env.GLEAN_API_TOKEN,
  GLEAN_SERVER_URL: process.env.GLEAN_SERVER_URL,
  GLEAN_USE_FIXTURE: process.env.GLEAN_USE_FIXTURE,
};

afterEach(() => {
  server.resetHandlers();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('parsePlatformChatResponse preserves snippets used for grounding', () => {
  const result = parsePlatformChatResponse({
    object: 'RESPONSE',
    status: 'COMPLETED',
    output: [
      {
        type: 'MESSAGE',
        role: 'ASSISTANT',
        content: [
          {
            type: 'OUTPUT_TEXT',
            text: 'Data is encrypted at rest.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  {
                    type: 'DOCUMENT',
                    document_id: 'data-protection',
                    title: 'Data Protection Standard',
                    url: 'https://example.test/data-protection',
                  },
                ],
                snippets: [{ text: 'AES-256 encryption at rest.' }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(result, {
    answer: 'Data is encrypted at rest.',
    citations: [
      {
        title: 'Data Protection Standard',
        url: 'https://example.test/data-protection',
        snippet: 'AES-256 encryption at rest.',
      },
    ],
    unfinished: false,
  });
});

test('parsePlatformChatResponse keeps refusal distinct from unfinished', () => {
  const base = {
    object: 'RESPONSE',
    status: 'COMPLETED',
    output: [
      {
        type: 'MESSAGE',
        role: 'ASSISTANT',
        content: [{ type: 'OUTPUT_TEXT', text: '', annotations: [] }],
      },
    ],
  };
  assert.equal(parsePlatformChatResponse(base).unfinished, true);
  base.output[0].content[0].text = 'INSUFFICIENT_EVIDENCE';
  assert.deepEqual(parsePlatformChatResponse(base), {
    answer: '',
    citations: [],
    unfinished: false,
  });
  assert.throws(
    () => parsePlatformChatResponse({ messages: [] }),
    /did not return a completed response/,
  );
});

test('askChat posts an ephemeral Platform request and retries unfinished output', async () => {
  let requests = 0;
  const bodies: unknown[] = [];
  server.use(
    http.post(`${baseUrl}/api/chat`, async ({ request }) => {
      requests += 1;
      assert.equal(new URL(request.url).pathname, '/api/chat');
      assert.equal(request.headers.get('x-glean-include-experimental'), 'true');
      bodies.push(await request.json());
      return HttpResponse.json({
        id: `resp_${requests}`,
        object: 'RESPONSE',
        created_at: '2026-08-21T21:31:00Z',
        status: 'COMPLETED',
        output: [
          {
            type: 'MESSAGE',
            role: 'ASSISTANT',
            content: [{ type: 'OUTPUT_TEXT', text: '', annotations: [] }],
          },
        ],
        store: false,
        request_id: `req_${requests}`,
      });
    }),
  );
  process.env.GLEAN_SERVER_URL = baseUrl;
  process.env.GLEAN_API_TOKEN = 'test-token';
  delete process.env.GLEAN_USE_FIXTURE;

  await assert.rejects(
    askChat('SEC-01', 'Do you encrypt data at rest?'),
    (error) =>
      error instanceof ChatUnfinishedError &&
      error.message.includes('after 2 attempt'),
  );
  assert.equal(requests, 2);
  assert.deepEqual(bodies[0], {
    input:
      'You are drafting a response to a customer security questionnaire. Use ONLY the retrieved company documents as evidence. If the retrieved documents do not support an answer, reply exactly: INSUFFICIENT_EVIDENCE. Never infer a control, certification, or commitment that is not stated in the documents. Answer in two or three sentences, factual and neutral, ready to paste into the customer document. Do not address the reader, do not editorialise, do not narrate your reasoning.\n\nQuestion: Do you encrypt data at rest?',
    stream: false,
    store: false,
  });
});
