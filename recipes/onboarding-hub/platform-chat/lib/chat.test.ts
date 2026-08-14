import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import {
  askClientChat,
  buildChatRequest,
  parseClientChatResponse,
  withEscalate,
} from './chat.ts';

const originalEnv = {
  GLEAN_API_TOKEN: process.env.GLEAN_API_TOKEN,
  GLEAN_SERVER_URL: process.env.GLEAN_SERVER_URL,
  GLEAN_USE_FIXTURE: process.env.GLEAN_USE_FIXTURE,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('buildChatRequest keeps saveChat false and CONTENT on every turn', () => {
  assert.deepEqual(
    buildChatRequest('How do I set up VPN?', [
      { author: 'USER', text: 'What should I do on my first day?' },
      { author: 'GLEAN_AI', text: 'Start with the checklist.' },
    ]),
    {
      saveChat: false,
      messages: [
        {
          author: 'USER',
          messageType: 'CONTENT',
          fragments: [{ text: 'What should I do on my first day?' }],
        },
        {
          author: 'GLEAN_AI',
          messageType: 'CONTENT',
          fragments: [{ text: 'Start with the checklist.' }],
        },
        {
          author: 'USER',
          messageType: 'CONTENT',
          fragments: [{ text: 'How do I set up VPN?' }],
        },
      ],
    },
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
          { text: 'Install the Sample Corp VPN client from the IT portal.' },
          {
            text: '',
            citation: {
              sourceDocument: {
                title: 'VPN Setup Guide',
                url: 'https://portal.sample.internal/support/vpn-setup',
              },
            },
          },
        ],
      },
    ],
  });
  assert.equal(
    parsed.answer,
    'Install the Sample Corp VPN client from the IT portal.',
  );
  assert.deepEqual(parsed.citations, [
    {
      title: 'VPN Setup Guide',
      url: 'https://portal.sample.internal/support/vpn-setup',
    },
  ]);
});

test('withEscalate flags empty, thin, and uncited answers', () => {
  assert.equal(
    withEscalate({
      answer: 'Install the Sample Corp VPN client from the IT portal.',
      citations: [
        {
          title: 'VPN Setup Guide',
          url: 'https://portal.sample.internal/support/vpn-setup',
        },
      ],
    }).escalate,
    false,
  );
  assert.equal(
    withEscalate({ answer: 'Too short.', citations: [] }).escalate,
    true,
  );
  assert.equal(
    withEscalate({
      answer: 'I do not have a cited source in the onboarding docs for that.',
      citations: [],
    }).escalate,
    true,
  );
});

test('askClientChat throws when the fixture key is missing', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  await assert.rejects(
    askClientChat('a question with no recorded fixture', []),
    /No fixture recorded for question: a question with no recorded fixture/,
  );
});

test('askClientChat serves a recorded cited answer without credentials', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  const result = await askClientChat('How do I set up VPN?', []);
  assert.ok(result.answer.length >= 20);
  assert.ok(result.citations.length > 0);
  assert.equal(result.escalate, false);
});

test('askClientChat posts buildChatRequest and retries empty CONTENT once', async (t) => {
  let requests = 0;
  const bodies: unknown[] = [];
  const server = http.createServer(async (request, response) => {
    requests += 1;
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
            fragments: [{ text: '   ' }],
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
  delete process.env.GLEAN_USE_FIXTURE;

  await assert.rejects(
    askClientChat('How do I set up VPN?', []),
    /no answer text after two attempts/,
  );
  assert.equal(requests, 2);
  assert.deepEqual(bodies[0], buildChatRequest('How do I set up VPN?', []));
});
