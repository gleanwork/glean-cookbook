import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import {
  askPlatformChat,
  buildPlatformChatRequest,
  parsePlatformChatResponse,
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

test('buildPlatformChatRequest keeps history ephemeral and maps assistant roles', () => {
  assert.deepEqual(
    buildPlatformChatRequest('How do I set up VPN?', [
      { author: 'USER', text: 'What should I do on my first day?' },
      { author: 'ASSISTANT', text: 'Start with the checklist.' },
    ]),
    {
      stream: false,
      store: false,
      input: [
        {
          role: 'USER',
          content: 'What should I do on my first day?',
        },
        {
          role: 'ASSISTANT',
          content: 'Start with the checklist.',
        },
        {
          role: 'USER',
          content: 'How do I set up VPN?',
        },
      ],
    },
  );
});

test('parsePlatformChatResponse joins output text and reads annotation sources', () => {
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
            text: 'Install the Sample Corp VPN client ',
            annotations: [],
          },
          {
            type: 'OUTPUT_TEXT',
            text: 'from the IT portal.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  {
                    type: 'DOCUMENT',
                    document_id: 'vpn-guide',
                    title: 'VPN Setup Guide',
                    url: 'https://portal.sample.internal/support/vpn-setup',
                  },
                ],
              },
            ],
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

test('parsePlatformChatResponse retains document-id-only evidence', () => {
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
            text: 'Use the onboarding checklist.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  { type: 'DOCUMENT', document_id: 'onboarding-checklist' },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(parsed.citations, [{ title: 'onboarding-checklist' }]);
});

test('parsePlatformChatResponse rejects legacy and incomplete envelopes', () => {
  assert.throws(
    () => parsePlatformChatResponse({ messages: [] }),
    /did not return a completed response/,
  );
  assert.throws(
    () =>
      parsePlatformChatResponse({
        object: 'RESPONSE',
        status: 'IN_PROGRESS',
      }),
    /did not return a completed response/,
  );
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

test('askPlatformChat throws when the fixture key is missing', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  await assert.rejects(
    askPlatformChat('a question with no recorded fixture', []),
    /No fixture recorded for question: a question with no recorded fixture/,
  );
});

test('askPlatformChat serves a recorded cited answer without credentials', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  const result = await askPlatformChat('How do I set up VPN?', []);
  assert.ok(result.answer.length >= 20);
  assert.ok(result.citations.length > 0);
  assert.equal(result.escalate, false);
});

test('askPlatformChat posts an ephemeral request and retries empty output once', async (t) => {
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
        id: `resp-${requests}`,
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
        request_id: `request-${requests}`,
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
    askPlatformChat('How do I set up VPN?', []),
    /no answer text after two attempts/,
  );
  assert.equal(requests, 2);
  assert.deepEqual(
    bodies[0],
    buildPlatformChatRequest('How do I set up VPN?', []),
  );
});
