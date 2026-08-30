import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverBackend } from './tenant-discovery.mjs';

test('discovers and normalizes a customer backend', async () => {
  const result = await discoverBackend(
    ' Person@Example.com ',
    async (url, init) => {
      assert.equal(url, 'https://app.glean.com/config/search');
      assert.deepEqual(JSON.parse(init.body), { email: 'person@example.com' });
      return { search_config: { queryURL: 'https://acme.askscio.com/search' } };
    },
  );
  assert.deepEqual(result, {
    instance: 'acme',
    backend: 'https://acme-be.glean.com',
  });
});

// Discovery returns the backend host directly for most tenants, and the legacy
// frontend host for others. Both must land on the same backend.
test('discovers a backend from either discovery host form', async () => {
  const discover = (queryURL) =>
    discoverBackend('person@example.com', async () => ({
      search_config: { queryURL },
    }));
  for (const queryURL of [
    'https://acme-be.glean.com/',
    'https://acme.askscio.com/search',
    'https://acme.glean.com/search',
  ]) {
    assert.deepEqual(await discover(queryURL), {
      instance: 'acme',
      backend: 'https://acme-be.glean.com',
    });
  }
  assert.deepEqual(await discover('https://my-corp-be.glean.com/'), {
    instance: 'my-corp',
    backend: 'https://my-corp-be.glean.com',
  });
  assert.deepEqual(await discover('https://scio-prod.askscio.com/'), {
    instance: 'scio-prod',
    backend: 'https://scio-prod-be.glean.com',
  });
});

test('rejects generic and untrusted discovery responses', async () => {
  await assert.rejects(
    discoverBackend('person@example.com', async () => ({
      search_config: { queryURL: 'https://app.askscio.com/search' },
    })),
    /No customer Glean tenant/u,
  );
  await assert.rejects(
    discoverBackend('person@example.com', async () => ({
      search_config: { queryURL: 'https://attacker.example/search' },
    })),
    /No customer Glean tenant/u,
  );
});
