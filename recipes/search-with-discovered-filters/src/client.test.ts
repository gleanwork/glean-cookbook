import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, test } from 'vitest';
import { Glean } from '@gleanwork/api-client';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
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

test('public instructions use SEARCH through DCR', async () => {
  const recipeRoot = new URL('../', import.meta.url);
  const client = await fs.readFile(
    new URL('src/client.ts', recipeRoot),
    'utf8',
  );
  const pkg = await fs.readFile(new URL('package.json', recipeRoot), 'utf8');
  const recipe = await fs.readFile(new URL('recipe.json', recipeRoot), 'utf8');
  const readme = await fs.readFile(new URL('README.md', recipeRoot), 'utf8');
  const instructions = `${client}\n${pkg}\n${recipe}\n${readme}`;

  assert.match(pkg, /glean-auth login --scopes SEARCH/);
  assert.match(client, /scopes: \['SEARCH'\]/);
  assert.match(
    instructions,
    /dynamic client registration|registers the OAuth client dynamically/,
  );
  assert.doesNotMatch(
    instructions,
    /GLEAN_OAUTH_CLIENT_ID|administrator-provisioned|public OAuth client/,
  );
  assert.equal(
    recipe.match(/cd search-with-discovered-filters &&/gu)?.length,
    1,
  );
});

test('prefers work-email discovery over the environment fallback', async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const searchRequests: Array<{
    url: string;
    authorization: string | null;
    body: unknown;
  }> = [];

  process.env.GLEAN_API_TOKEN = 'fixture-token';
  process.env.GLEAN_SERVER_URL = 'https://wrong-tenant.example.com';
  server.use(
    http.post('https://app.glean.com/config/search', async ({ request }) => {
      requests.push({ url: request.url, body: await request.text() });
      return HttpResponse.json({
        search_config: { queryURL: 'https://search.example.com' },
      });
    }),
    http.post('https://search.example.com/api/search', async ({ request }) => {
      searchRequests.push({
        url: request.url,
        authorization: request.headers.get('authorization'),
        body: await request.json(),
      });
      return HttpResponse.json({
        request_id: 'search-request',
        results: [],
        has_more: false,
        next_cursor: null,
        warnings: [],
      });
    }),
  );

  const client = await createGleanClient({ email: 'Person@Example.com' });
  assert.ok(client instanceof Glean);
  assert.deepEqual(requests, [
    {
      url: 'https://app.glean.com/config/search',
      body: JSON.stringify({
        email: 'person@example.com',
        emailDomain: 'example.com',
        isGleanApp: true,
      }),
    },
  ]);

  await client.search.query({ query: 'policy' });
  assert.deepEqual(searchRequests, [
    {
      url: 'https://search.example.com/api/search',
      authorization: 'Bearer fixture-token',
      body: { query: 'policy', page_size: 10 },
    },
  ]);
});
