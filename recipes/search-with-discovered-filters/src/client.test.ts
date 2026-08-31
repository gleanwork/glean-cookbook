import assert from 'node:assert/strict';
import test from 'node:test';
import { Glean } from '@gleanwork/api-client';
import { createGleanClient } from './client.js';

void test('prefers work-email discovery over the environment fallback', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiToken = process.env.GLEAN_API_TOKEN;
  const originalServerUrl = process.env.GLEAN_SERVER_URL;
  const requests: Array<{ url: string; body: string }> = [];

  process.env.GLEAN_API_TOKEN = 'fixture-token';
  process.env.GLEAN_SERVER_URL = 'https://wrong-tenant.example.com';
  globalThis.fetch = (input, init) => {
    requests.push({
      url:
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          search_config: { queryURL: 'https://search.example.com' },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  };

  try {
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
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiToken === undefined) delete process.env.GLEAN_API_TOKEN;
    else process.env.GLEAN_API_TOKEN = originalApiToken;
    if (originalServerUrl === undefined) delete process.env.GLEAN_SERVER_URL;
    else process.env.GLEAN_SERVER_URL = originalServerUrl;
  }
});
