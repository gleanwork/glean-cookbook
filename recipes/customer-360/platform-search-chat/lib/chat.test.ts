import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import {
  askPlatformChat,
  buildPlatformChatRequest,
  frameAccountPrompt,
  parsePlatformChatResponse,
} from './chat.ts';

const originalEnv = {
  GLEAN_API_TOKEN: process.env.GLEAN_API_TOKEN,
  GLEAN_SERVER_URL: process.env.GLEAN_SERVER_URL,
  GLEAN_USE_FIXTURE: process.env.GLEAN_USE_FIXTURE,
  GLEAN_ACCOUNT_NAME: process.env.GLEAN_ACCOUNT_NAME,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('buildPlatformChatRequest keeps synthesis ephemeral', () => {
  process.env.GLEAN_ACCOUNT_NAME = 'Globex';
  const prompt = frameAccountPrompt('Give me a customer summary');
  assert.deepEqual(buildPlatformChatRequest(prompt), {
    input: prompt,
    stream: false,
    store: false,
  });
});

test('parsePlatformChatResponse joins output and normalizes citations', () => {
  const parsed = parsePlatformChatResponse({
    object: 'RESPONSE',
    status: 'COMPLETED',
    output: [
      {
        type: 'MESSAGE',
        role: 'ASSISTANT',
        content: [
          {
            type: 'OUTPUT_TEXT',
            text: 'Globex renews 2026-09-30 ',
            annotations: [],
          },
          {
            type: 'OUTPUT_TEXT',
            text: 'and is on track.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  {
                    type: 'DOCUMENT',
                    document_id: 'globex-renewal',
                    title: 'Globex — Renewal Status (Q3 2026)',
                    url: 'https://portal.sample.internal/sales/accounts/globex/renewal-q3-2026',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(parsed.answer, 'Globex renews 2026-09-30 and is on track.');
  assert.deepEqual(parsed.citations, [
    {
      title: 'Globex — Renewal Status (Q3 2026)',
      url: 'https://portal.sample.internal/sales/accounts/globex/renewal-q3-2026',
    },
  ]);
});

test('parsePlatformChatResponse rejects a Client Chat envelope', () => {
  assert.throws(
    () => parsePlatformChatResponse({ messages: [] }),
    /did not return a completed response/,
  );
});

test('askPlatformChat looks up the inbound question, not the framed prompt', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  process.env.GLEAN_ACCOUNT_NAME = 'Globex';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  const result = await askPlatformChat('Give me a customer summary');
  assert.ok(result.answer.length > 0);
  assert.ok(result.citations.length > 0);
});

test('askPlatformChat throws when the fixture key is missing', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  await assert.rejects(
    askPlatformChat('a question with no recorded fixture'),
    /No fixture recorded for question: a question with no recorded fixture/,
  );
});

test('askPlatformChat posts the framed prompt to /api/chat', async (t) => {
  const bodies: unknown[] = [];
  const server = http.createServer(async (request, response) => {
    assert.equal(request.url, '/api/chat');
    assert.equal(request.headers['x-glean-include-experimental'], 'true');
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'resp_customer_360',
        object: 'RESPONSE',
        created_at: '2026-08-21T21:31:00Z',
        status: 'COMPLETED',
        output: [
          {
            type: 'MESSAGE',
            role: 'ASSISTANT',
            content: [
              {
                type: 'OUTPUT_TEXT',
                text: 'Globex renews 2026-09-30 and is on track.',
                annotations: [],
              },
            ],
          },
        ],
        store: false,
        request_id: 'req_customer_360',
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  assert(address && typeof address !== 'string');
  process.env.GLEAN_SERVER_URL = `http://127.0.0.1:${address.port}`;
  process.env.GLEAN_API_TOKEN = 'test-token';
  process.env.GLEAN_ACCOUNT_NAME = 'Globex';
  delete process.env.GLEAN_USE_FIXTURE;

  const question = "What's the status of our renewal with that account?";
  const result = await askPlatformChat(question);
  assert.equal(result.answer, 'Globex renews 2026-09-30 and is on track.');
  assert.deepEqual(
    bodies[0],
    buildPlatformChatRequest(frameAccountPrompt(question)),
  );
});
