import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  buildSearchRequest,
  loadAccount,
  parseSearch,
  tileQueries,
} from './search.ts';

const originalEnv = {
  GLEAN_API_TOKEN: process.env.GLEAN_API_TOKEN,
  GLEAN_SERVER_URL: process.env.GLEAN_SERVER_URL,
  GLEAN_USE_FIXTURE: process.env.GLEAN_USE_FIXTURE,
  GLEAN_ACCOUNT_NAME: process.env.GLEAN_ACCOUNT_NAME,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('buildSearchRequest sends page_size 3', () => {
  assert.deepEqual(buildSearchRequest('Globex renewal status'), {
    query: 'Globex renewal status',
    page_size: 3,
  });
});

test('parseSearch keeps snippets as strings', () => {
  const results = parseSearch({
    results: [
      {
        url: 'https://portal.sample.internal/sales/accounts/globex',
        title: 'Globex — Account Notes',
        snippets: [
          'Current ARR: $840,000.',
          'Deployment: 1,200 licensed seats.',
        ],
        datasource: 'sample_catalog',
      },
    ],
    has_more: false,
    next_cursor: null,
    request_id: 'fixture-account-notes',
    warnings: [],
  });
  assert.deepEqual(results, [
    {
      title: 'Globex — Account Notes',
      url: 'https://portal.sample.internal/sales/accounts/globex',
      snippets: ['Current ARR: $840,000.', 'Deployment: 1,200 licensed seats.'],
    },
  ]);
});

test('loadAccount throws when a tile query has no fixture', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  process.env.GLEAN_ACCOUNT_NAME = 'UnknownCo';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  await assert.rejects(
    loadAccount(),
    /No fixture recorded for query: UnknownCo account notes ARR seats contacts/,
  );
});

test('loadAccount serves Globex tiles without constructing Glean', async () => {
  process.env.GLEAN_USE_FIXTURE = 'true';
  process.env.GLEAN_ACCOUNT_NAME = 'Globex';
  delete process.env.GLEAN_API_TOKEN;
  delete process.env.GLEAN_SERVER_URL;
  const payload = await loadAccount();
  assert.equal(payload.account.name, 'Globex');
  assert.equal(payload.tiles.length, 3);
  const expected = tileQueries('Globex');
  for (const [index, tile] of payload.tiles.entries()) {
    assert.equal(tile.query, expected[index].query);
    assert.ok(tile.results.length > 0);
    assert.equal(tile.empty, false);
    for (const result of tile.results) {
      assert.ok(Array.isArray(result.snippets));
      for (const snippet of result.snippets) {
        assert.equal(typeof snippet, 'string');
      }
    }
  }
});
