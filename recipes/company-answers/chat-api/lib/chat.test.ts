import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  askPlatformChat,
  buildPlatformChatRequest,
  parsePlatformChatResponse,
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

test('buildPlatformChatRequest keeps the turn ephemeral', () => {
  assert.deepEqual(buildPlatformChatRequest("What's our PTO policy?"), {
    input: "What's our PTO policy?",
    stream: false,
    store: false,
  });
});

test('parsePlatformChatResponse joins output and reads citation sources', () => {
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
            text: 'Acme employees accrue 20 days of PTO. ',
            annotations: [],
          },
          {
            type: 'OUTPUT_TEXT',
            text: 'Request leave in Workday.',
            annotations: [
              {
                type: 'CITATION',
                sources: [
                  {
                    type: 'DOCUMENT',
                    document_id: 'acme-pto',
                    title: 'Acme Employee Handbook — Time Off',
                    url: 'https://intranet.acme.test/hr/handbook/time-off',
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
    'Acme employees accrue 20 days of PTO. Request leave in Workday.',
  );
  assert.deepEqual(parsed.citations, [
    {
      title: 'Acme Employee Handbook — Time Off',
      url: 'https://intranet.acme.test/hr/handbook/time-off',
    },
  ]);
});

test('parsePlatformChatResponse rejects a Client Chat envelope', () => {
  assert.throws(
    () => parsePlatformChatResponse({ messages: [] }),
    /did not return a completed response/,
  );
});

test('askPlatformChat looks up the inbound question', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  const result = await askPlatformChat("What's our PTO policy?");
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
