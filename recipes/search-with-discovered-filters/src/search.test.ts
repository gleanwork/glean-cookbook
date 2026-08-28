import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlatformSearchClient,
  PlatformSearchError,
  runSearchFlow,
  type DatasourceFilterInfo,
} from './search.js';

interface RecordedRequest {
  url: URL;
  init?: RequestInit;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

test('discovers and applies a returned field filter to search', async () => {
  const requests: RecordedRequest[] = [];
  const responses = [
    jsonResponse({
      request_id: 'catalog-request',
      datasources: [
        {
          datasource: 'jira',
          filters: [{ field: 'status', type: 'STRING', operators: ['EQUALS'] }],
        },
      ],
    }),
    jsonResponse({
      request_id: 'suggestion-request',
      datasources: [
        {
          datasource: 'jira',
          filters: [
            {
              field: 'status',
              type: 'STRING',
              operators: ['EQUALS'],
              values: ['In Progress'],
            },
          ],
        },
      ],
    }),
    jsonResponse({
      request_id: 'search-request',
      results: [
        {
          title: 'Search migration',
          url: 'https://jira.example/browse/DEV-123',
          datasource: 'jira',
          snippets: ['The migration is in progress.'],
        },
      ],
      has_more: false,
      next_cursor: null,
      warnings: [],
    }),
  ];
  const mockFetch: typeof fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), init });
    const response = responses.shift();
    assert.ok(response, 'unexpected request');
    return response;
  };
  const client = new PlatformSearchClient({
    backend: 'https://acme-be.glean.com',
    token: 'test-token',
    fetch: mockFetch,
  });

  const result = await runSearchFlow(client, 'search migration', {
    selectDatasource: (datasources) => datasources[0].datasource,
    selectFilter: (datasource: DatasourceFilterInfo) => ({
      field: datasource.filters[0].field,
      value: datasource.filters[0].values![0],
    }),
  });

  assert.equal(result.datasource, 'jira');
  assert.deepEqual(result.filter, {
    field: 'status',
    value: 'In Progress',
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url.pathname, '/api/search/filters');
  assert.equal(requests[0].url.search, '');
  assert.equal(requests[1].url.pathname, '/api/search/filters');
  assert.equal(requests[1].url.searchParams.get('datasources'), 'jira');
  assert.equal(requests[1].url.searchParams.get('query'), 'search migration');
  assert.equal(requests[2].url.pathname, '/api/search');
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), {
    query: 'search migration',
    page_size: 10,
    datasources: ['jira'],
    filters: [
      {
        field: 'status',
        values: ['In Progress'],
        operator: 'EQUALS',
      },
    ],
  });
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer test-token');
    assert.equal(headers.get('x-glean-include-experimental'), 'true');
  }
});

test('falls back to a discovered datasource when no values are suggested', async () => {
  const requests: RecordedRequest[] = [];
  const responses = [
    jsonResponse({
      request_id: 'catalog-request',
      datasources: [{ datasource: 'gdrive', filters: [] }],
    }),
    jsonResponse({
      request_id: 'suggestion-request',
      datasources: [{ datasource: 'gdrive', filters: [] }],
    }),
    jsonResponse({
      request_id: 'search-request',
      results: [],
      has_more: false,
      next_cursor: null,
      warnings: [],
    }),
  ];
  const client = new PlatformSearchClient({
    backend: 'https://acme-be.glean.com',
    token: 'test-token',
    fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), init });
      return responses.shift()!;
    },
  });

  const result = await runSearchFlow(client, 'planning', {
    selectDatasource: (datasources) => datasources[0].datasource,
    selectFilter: () => undefined,
  });

  assert.equal(result.filter, undefined);
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), {
    query: 'planning',
    page_size: 10,
    datasources: ['gdrive'],
  });
});

test('surfaces rate-limit guidance and request IDs', async () => {
  const client = new PlatformSearchClient({
    backend: 'https://acme-be.glean.com',
    token: 'test-token',
    fetch: async () =>
      jsonResponse(
        {
          title: 'Too many requests',
          detail: 'Slow down',
          request_id: 'request-429',
        },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
  });

  await assert.rejects(
    client.listFilters(),
    (error: unknown) =>
      error instanceof PlatformSearchError &&
      error.status === 429 &&
      error.retryAfter === '30' &&
      error.requestId === 'request-429' &&
      /Retry after 30/u.test(error.message),
  );
});
