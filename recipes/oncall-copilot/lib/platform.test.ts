import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import { ChatUnfinishedError, chat, parseChat } from './platform.ts';

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

test('Platform Chat retries one unfinished response, then throws a distinct error', async (t) => {
  let requests = 0;
  const bodies: unknown[] = [];
  const server = http.createServer(async (request, response) => {
    requests += 1;
    assert.equal(request.url, '/api/chat');
    assert.equal(request.headers['x-glean-include-experimental'], 'true');
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
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
