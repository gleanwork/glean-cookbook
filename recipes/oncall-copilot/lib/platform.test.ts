import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ChatUnfinishedError, chat, parseChat } from './platform.ts';

const baseUrl = 'https://fixture.glean.example.com';
const server = setupServer();

before(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

after(() => {
  server.close();
});

const originalEnv = {
  GLEAN_API_TOKEN: process.env.GLEAN_API_TOKEN,
  GLEAN_SERVER_URL: process.env.GLEAN_SERVER_URL,
  GLEAN_USE_FIXTURE: process.env.GLEAN_USE_FIXTURE,
  X_GLEAN_INCLUDE_EXPERIMENTAL: process.env.X_GLEAN_INCLUDE_EXPERIMENTAL,
};

afterEach(() => {
  server.resetHandlers();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('Platform Chat retries one unfinished response, then throws a distinct error', async () => {
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
            content: [{ type: 'OUTPUT_TEXT', text: '   ', annotations: [] }],
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
    chat('Summarize this incident', 'unused-in-live-mode'),
    (error) =>
      error instanceof ChatUnfinishedError &&
      error.attempts === 2 &&
      error.message.includes('no answer text'),
  );
  assert.equal(requests, 2);
  assert.deepEqual(bodies[0], {
    input: 'Summarize this incident',
    stream: false,
    store: false,
  });
});

test('parseChat rejects a Client Chat envelope', () => {
  assert.throws(
    () => parseChat({ messages: [] }),
    /did not return a completed response/,
  );
});

test('parseChat joins output, deduplicates links, and retains id-only evidence', () => {
  const result = parseChat({
    object: 'RESPONSE',
    status: 'COMPLETED',
    output: [
      {
        type: 'MESSAGE',
        role: 'ASSISTANT',
        content: [
          {
            type: 'OUTPUT_TEXT',
            text: 'Canary failures match ',
            annotations: [],
          },
          {
            type: 'OUTPUT_TEXT',
            text: 'the prior incident.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  {
                    type: 'DOCUMENT',
                    document_id: 'PAY-2114',
                    title: 'PAY-2114 incident review',
                    url: 'https://example.test/incidents/PAY-2114',
                  },
                  {
                    type: 'DOCUMENT',
                    document_id: 'PAY-2114-copy',
                    title: 'Duplicate link',
                    url: 'https://example.test/incidents/PAY-2114',
                  },
                  {
                    type: 'DOCUMENT',
                    document_id: 'runbook-only-id',
                  },
                  {
                    type: 'DOCUMENT',
                    document_id: 'unsafe',
                    title: 'Unsafe link',
                    url: 'javascript:alert(1)',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(result.text, 'Canary failures match the prior incident.');
  assert.deepEqual(result.citations, [
    {
      title: 'PAY-2114 incident review',
      url: 'https://example.test/incidents/PAY-2114',
    },
    { title: 'runbook-only-id' },
    { title: 'Unsafe link' },
  ]);
});
