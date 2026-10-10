import assert from 'node:assert/strict';
import { Glean } from '@gleanwork/api-client';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, test } from 'vitest';

import { createGleanClient } from './client.js';

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

test('discovers the backend from work email and sends the fallback token', async () => {
  const authorizations: Array<string | null> = [];
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  process.env.GLEAN_SERVER_URL = 'https://wrong-tenant.example.com';
  server.use(
    http.post('https://app.glean.com/config/search', () =>
      HttpResponse.json({
        search_config: { queryURL: 'https://example-be.glean.com' },
      }),
    ),
    http.get('https://example-be.glean.com/api/skills', ({ request }) => {
      authorizations.push(request.headers.get('authorization'));
      return HttpResponse.json({
        results: [],
        has_more: false,
        next_cursor: null,
        request_id: 'fixture-request',
      });
    }),
  );

  const client = await createGleanClient({ email: 'person@example.com' });
  assert.ok(client instanceof Glean);
  await client.skills.list(100);
  assert.deepEqual(authorizations, ['Bearer fixture-token']);
});

test('rejects a backend that is not an HTTPS origin', async () => {
  await assert.rejects(
    createGleanClient({ serverUrl: 'http://example-be.glean.com' }),
    /complete Glean backend HTTPS origin/,
  );
});
