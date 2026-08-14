import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import {
  askClientChat,
  buildChatRequest,
  frameAccountPrompt,
  parseClientChatResponse,
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

test('buildChatRequest keeps saveChat false and omits USER messageType', () => {
  process.env.GLEAN_ACCOUNT_NAME = 'Globex';
  const request = buildChatRequest(
    frameAccountPrompt('Give me a customer summary'),
  );
  assert.equal(request.saveChat, false);
  assert.equal(request.messages.length, 1);
  assert.equal(request.messages[0].author, 'USER');
  assert.deepEqual(request.messages[0].fragments, [
    { text: frameAccountPrompt('Give me a customer summary') },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(request.messages[0], 'messageType'),
    false,
  );
});

test('parseClientChatResponse ignores UPDATE progress and reads fragment citations', () => {
  const parsed = parseClientChatResponse({
    messages: [
      {
        author: 'GLEAN_AI',
        messageType: 'UPDATE',
        fragments: [{ text: 'Searching company knowledge' }],
      },
      {
        author: 'GLEAN_AI',
        messageType: 'CONTENT',
        fragments: [
          { text: 'Globex renews 2026-09-30 and is on track.' },
          {
            text: '',
            citation: {
              sourceDocument: {
                title: 'Globex — Renewal Status (Q3 2026)',
                url: 'https://portal.sample.internal/sales/accounts/globex/renewal-q3-2026',
              },
            },
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

test('askClientChat looks up the inbound question, not the framed prompt', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  process.env.GLEAN_ACCOUNT_NAME = 'Globex';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  const result = await askClientChat('Give me a customer summary');
  assert.ok(result.answer.length > 0);
  assert.ok(result.citations.length > 0);
});

test('askClientChat throws when the fixture key is missing', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  await assert.rejects(
    askClientChat('a question with no recorded fixture'),
    /No fixture recorded for question: a question with no recorded fixture/,
  );
});

test('askClientChat posts the framed prompt without messageType', async (t) => {
  const bodies: unknown[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        messages: [
          {
            author: 'GLEAN_AI',
            messageType: 'CONTENT',
            fragments: [{ text: 'Globex renews 2026-09-30 and is on track.' }],
          },
        ],
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

  const result = await askClientChat(
    "What's the status of our renewal with that account?",
  );
  assert.equal(result.answer, 'Globex renews 2026-09-30 and is on track.');
  assert.deepEqual(
    bodies[0],
    buildChatRequest(
      frameAccountPrompt("What's the status of our renewal with that account?"),
    ),
  );
});
