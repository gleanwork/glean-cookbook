import { Glean } from '@gleanwork/api-client';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

import { createGleanClient, resolveBackend } from './client.js';

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

test('prefers --backend, then email discovery, then GLEAN_SERVER_URL', async () => {
  process.env.GLEAN_SERVER_URL = 'https://env-be.glean.com';
  server.use(
    http.post('https://app.glean.com/config/search', () =>
      HttpResponse.json({
        search_config: { queryURL: 'https://example-be.glean.com' },
      }),
    ),
  );
  expect(await resolveBackend({ backend: 'https://acme-be.glean.com/' })).toBe(
    'https://acme-be.glean.com',
  );
  expect(await resolveBackend({ email: 'person@example.com' })).toBe(
    'https://example-be.glean.com',
  );
  expect(await resolveBackend({})).toBe('https://env-be.glean.com');
  delete process.env.GLEAN_SERVER_URL;
  await expect(resolveBackend({})).rejects.toThrow(/Pass --backend/);
});

test('rejects a backend that is not an HTTPS origin', async () => {
  for (const backend of [
    'http://acme-be.glean.com',
    'https://acme-be.glean.com/api',
    'not a url',
  ]) {
    await expect(resolveBackend({ backend })).rejects.toThrow(
      /complete Glean backend HTTPS origin/,
    );
  }
});

test('sends the fallback token on Skills requests', async () => {
  const authorizations: Array<string | null> = [];
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  server.use(
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
  const client = createGleanClient('https://example-be.glean.com');
  expect(client).toBeInstanceOf(Glean);
  await client.skills.list(100);
  expect(authorizations).toEqual(['Bearer fixture-token']);
});
