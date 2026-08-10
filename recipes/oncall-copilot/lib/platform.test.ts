import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import { ChatUnfinishedError, chat } from './platform.ts';

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

test('Client Chat retries one unfinished response, then throws a distinct error', async (t) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
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
    chat('Summarize this incident', 'unused-in-live-mode'),
    (error) =>
      error instanceof ChatUnfinishedError &&
      error.attempts === 2 &&
      error.message.includes('no answer text'),
  );
  assert.equal(requests, 2);
});
