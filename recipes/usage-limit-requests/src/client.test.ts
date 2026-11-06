import assert from 'node:assert/strict';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, test } from 'vitest';

import { connect } from './client.js';
import { page } from './fixtures.js';

const originalApiToken = process.env.GLEAN_API_TOKEN;
const originalServerUrl = process.env.GLEAN_SERVER_URL;
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  if (originalApiToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalApiToken;
  if (originalServerUrl === undefined) delete process.env.GLEAN_SERVER_URL;
  else process.env.GLEAN_SERVER_URL = originalServerUrl;
});

afterAll(() => {
  server.close();
});

test('sends the token to the SDK and the request bridge with experimental opt-in', async () => {
  const seen: Array<[string, string | null, string | null]> = [];
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  process.env.GLEAN_SERVER_URL = 'https://example-be.glean.com';
  const record = (request: Request) =>
    seen.push([
      new URL(request.url).pathname,
      request.headers.get('authorization'),
      request.headers.get('x-glean-include-experimental'),
    ]);
  server.use(
    http.get('https://example-be.glean.com/api/users/:id', ({ request }) => {
      record(request);
      return HttpResponse.json({
        user: { user_id: 'user-1', display_name: 'Ada' },
        request_id: 'trace-user',
      });
    }),
    http.get(
      'https://example-be.glean.com/api/usage/limit-increase-requests',
      ({ request }) => {
        record(request);
        return HttpResponse.json(page([]));
      },
    ),
  );

  const { glean, requests } = connect();
  assert.equal((await glean.users.get('user-1')).user.display_name, 'Ada');
  await requests.listMine();
  assert.deepEqual(seen, [
    ['/api/users/user-1', 'Bearer fixture-token', 'true'],
    ['/api/usage/limit-increase-requests', 'Bearer fixture-token', 'true'],
  ]);
});

test('requires a backend origin and a token', () => {
  process.env.GLEAN_SERVER_URL = 'http://example-be.glean.com';
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  assert.throws(() => connect(), /complete Glean backend HTTPS origin/);

  process.env.GLEAN_SERVER_URL = 'https://example-be.glean.com';
  process.env.GLEAN_API_TOKEN = ' ';
  assert.throws(() => connect(), /Set GLEAN_API_TOKEN in \.env/);
});
