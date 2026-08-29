import assert from 'node:assert/strict';
import test from 'node:test';
import { Glean, HTTPClient } from '@gleanwork/api-client';
import {
  runSearchFlow,
  type DatasourceFilterInfo,
  type PlatformSearchSdk,
  type SearchFiltersResponse,
  type SearchResponse,
} from './search.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function filtersResult(result: SearchFiltersResponse) {
  return { Headers: {}, result };
}

const emptySearchResponse: SearchResponse = {
  request_id: 'search-request',
  results: [],
  has_more: false,
  next_cursor: null,
  warnings: [],
};

test('uses the official SDK to discover and apply a returned field filter', async () => {
  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL = 'true';
  const requests: Request[] = [];
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
  const httpClient = new HTTPClient({
    fetcher: async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      const response = responses.shift();
      assert.ok(response, 'unexpected request');
      return response;
    },
  });
  const glean = new Glean({
    serverURL: 'https://acme-be.glean.com',
    apiToken: 'test-token',
    httpClient,
  });

  const result = await runSearchFlow(glean.search, 'search migration', {
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
  assert.equal(new URL(requests[0].url).pathname, '/api/search/filters');
  assert.equal(new URL(requests[1].url).pathname, '/api/search/filters');
  assert.equal(
    new URL(requests[1].url).searchParams.get('datasources'),
    'jira',
  );
  assert.equal(
    new URL(requests[1].url).searchParams.get('query'),
    'search migration',
  );
  assert.equal(new URL(requests[2].url).pathname, '/api/search');
  assert.deepEqual(await requests[2].json(), {
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
    assert.equal(request.headers.get('authorization'), 'Bearer test-token');
    assert.equal(request.headers.get('x-glean-include-experimental'), 'true');
  }
});

test('falls back to a discovered datasource when no values are suggested', async () => {
  const listResponses = [
    filtersResult({
      request_id: 'catalog-request',
      datasources: [{ datasource: 'gdrive', filters: [] }],
    }),
    filtersResult({
      request_id: 'suggestion-request',
      datasources: [{ datasource: 'gdrive', filters: [] }],
    }),
  ];
  let searchRequest: Parameters<PlatformSearchSdk['query']>[0] | undefined;
  const search: PlatformSearchSdk = {
    listFilters: async () => listResponses.shift()!,
    query: async (request) => {
      searchRequest = request;
      return emptySearchResponse;
    },
  };

  const result = await runSearchFlow(search, 'planning', {
    selectDatasource: (datasources) => datasources[0].datasource,
    selectFilter: () => undefined,
  });

  assert.equal(result.filter, undefined);
  assert.deepEqual(searchRequest, {
    query: 'planning',
    page_size: 10,
    datasources: ['gdrive'],
  });
});

test('rejects a datasource that filter discovery did not return', async () => {
  const search: PlatformSearchSdk = {
    listFilters: async () =>
      filtersResult({
        request_id: 'catalog-request',
        datasources: [{ datasource: 'jira', filters: [] }],
      }),
    query: async () => emptySearchResponse,
  };

  await assert.rejects(
    runSearchFlow(search, 'planning', {
      selectDatasource: () => 'gdrive',
      selectFilter: () => undefined,
    }),
    /Datasource "gdrive" was not returned/u,
  );
});
