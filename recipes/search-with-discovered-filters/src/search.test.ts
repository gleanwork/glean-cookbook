import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import readline from 'node:readline/promises';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { test, vi } from 'vitest';
import {
  ConnectionError,
  RequestTimeoutError,
} from '@gleanwork/api-client/models/errors';
import { chooseDatasource, parseCliOptions } from './cli.js';
import { formatSdkError } from './errors.js';

const searchScript = fileURLToPath(new URL('./search.ts', import.meta.url));

async function runSearchExample(
  responses: unknown[],
  args: string[],
  expectedExitCode = 0,
) {
  const requests: Array<{
    url: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }> = [];
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: string[] = [];
      request.setEncoding('utf8');
      for await (const chunk of request) chunks.push(String(chunk));
      requests.push({
        url: request.url ?? '',
        headers: request.headers,
        body: chunks.join(''),
      });

      const fixture = responses.shift();
      assert.notEqual(fixture, undefined, 'unexpected request');
      if (fixture instanceof Response) {
        response.writeHead(
          fixture.status,
          Object.fromEntries(fixture.headers.entries()),
        );
        response.end(await fixture.text());
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(fixture));
      }
    })().catch((error: unknown) => {
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', searchScript, ...args],
    {
      env: {
        ...process.env,
        GLEAN_SERVER_URL: `http://127.0.0.1:${address.port}`,
        GLEAN_API_TOKEN: 'test-token',
        X_GLEAN_INCLUDE_EXPERIMENTAL: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => (stdout += chunk));
  child.stderr.on('data', (chunk: string) => (stderr += chunk));

  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
  const { exitCode, signal } = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timeout);
  server.close();
  await once(server, 'close');

  assert.equal(signal, null, 'search process timed out');
  assert.equal(exitCode, expectedExitCode, stderr);
  assert.equal(responses.length, 0, 'not all fixture responses were used');
  return { requests, stdout, stderr };
}

const catalogResponse = {
  request_id: 'catalog-request',
  datasources: [
    {
      datasource: 'jira',
      filters: [{ field: 'status', type: 'STRING', operators: ['EQUALS'] }],
    },
  ],
};

const suggestionResponse = {
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
};

const searchResponse = {
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
};

void test('runs the documented SDK sequence with a suggested filter', async () => {
  const { requests, stdout } = await runSearchExample(
    [catalogResponse, suggestionResponse, searchResponse],
    ['--query', 'search migration', '--auto-select'],
  );

  assert.equal(requests.length, 3);
  const catalogRequest = requests.at(0);
  const suggestionsRequest = requests.at(1);
  const searchRequest = requests.at(2);
  assert.ok(catalogRequest);
  assert.ok(suggestionsRequest);
  assert.ok(searchRequest);

  assert.equal(
    new URL(catalogRequest.url, 'http://localhost').pathname,
    '/api/search/filters',
  );
  const suggestionsUrl = new URL(suggestionsRequest.url, 'http://localhost');
  assert.equal(suggestionsUrl.pathname, '/api/search/filters');
  assert.equal(suggestionsUrl.searchParams.get('datasources'), 'jira');
  assert.equal(suggestionsUrl.searchParams.get('query'), 'search migration');
  assert.equal(
    new URL(searchRequest.url, 'http://localhost').pathname,
    '/api/search',
  );
  assert.deepEqual(JSON.parse(searchRequest.body), {
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
    assert.equal(request.headers.authorization, 'Bearer test-token');
    assert.equal(request.headers['x-glean-include-experimental'], 'true');
  }
  assert.match(stdout, /Search migration/u);
});

void test('retries a transient API failure with SDK backoff', async () => {
  const transientFailure = new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Service unavailable',
      status: 503,
      detail: 'Search is temporarily unavailable.',
      code: 'service_unavailable',
      request_id: 'failed-request',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/problem+json',
        'Retry-After-Ms': '1',
      },
    },
  );

  const { requests } = await runSearchExample(
    [transientFailure, catalogResponse, suggestionResponse, searchResponse],
    ['--query', 'search migration', '--auto-select'],
  );

  assert.equal(requests.length, 4);
  assert.equal(requests[0]?.url, requests[1]?.url);
});

void test('prints typed API error details and exits unsuccessfully', async () => {
  const invalidRequest = new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Invalid request',
      status: 400,
      detail: 'The query is invalid.',
      code: 'invalid_parameter',
      request_id: 'invalid-request',
    }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  );

  const { stderr } = await runSearchExample(
    [invalidRequest],
    ['--query', 'search migration', '--auto-select'],
    1,
  );

  assert.match(stderr, /HTTP 400: The query is invalid\./u);
  assert.match(stderr, /Code: invalid_parameter/u);
  assert.match(stderr, /Request ID: invalid-request/u);
});

void test('searches the datasource without a field filter when none are suggested', async () => {
  const { requests, stdout } = await runSearchExample(
    [
      {
        request_id: 'catalog-request',
        datasources: [{ datasource: 'gdrive', filters: [] }],
      },
      {
        request_id: 'suggestion-request',
        datasources: [{ datasource: 'gdrive', filters: [] }],
      },
      { ...searchResponse, results: [] },
    ],
    ['--query', 'planning', '--auto-select'],
  );

  const searchRequest = requests.at(2);
  assert.ok(searchRequest);
  assert.deepEqual(JSON.parse(searchRequest.body), {
    query: 'planning',
    page_size: 10,
    datasources: ['gdrive'],
  });
  assert.match(stdout, /no suggested values/u);
});

void test('prints the cursor when another result page is available', async () => {
  const { stdout } = await runSearchExample(
    [
      catalogResponse,
      suggestionResponse,
      {
        ...searchResponse,
        has_more: true,
        next_cursor: 'next-page-token',
      },
    ],
    ['--query', 'search migration', '--auto-select'],
  );

  assert.match(stdout, /Next cursor: next-page-token/u);
});

void test('requires an explicit datasource for non-interactive input', async () => {
  const { stderr } = await runSearchExample(
    [catalogResponse],
    ['--query', 'search migration'],
    1,
  );

  assert.match(stderr, /Pass --datasource.*or use --auto-select/u);
});

void test('passes an explicit custom field through to the Search API', async () => {
  const { requests } = await runSearchExample(
    [
      catalogResponse,
      {
        request_id: 'suggestion-request',
        datasources: [{ datasource: 'jira', filters: [] }],
      },
      searchResponse,
    ],
    [
      '--query',
      'search migration',
      '--datasource',
      'jira',
      '--field',
      'custom_status',
      '--value',
      'Escalated',
    ],
  );

  const searchRequest = requests.at(2);
  assert.ok(searchRequest);
  assert.deepEqual(JSON.parse(searchRequest.body), {
    query: 'search migration',
    page_size: 10,
    datasources: ['jira'],
    filters: [
      {
        field: 'custom_status',
        values: ['Escalated'],
        operator: 'EQUALS',
      },
    ],
  });
});

void test('rejects zero instead of treating it as the last menu item', async () => {
  const logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
  const input = new PassThrough();
  const output = new PassThrough();
  const terminal = readline.createInterface({ input, output });
  let promptCount = 0;
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    if (!chunk.includes('Choose a datasource')) return;
    promptCount += 1;
    input.write(promptCount === 1 ? '0\n' : '1\n');
  });

  const selection = chooseDatasource(
    [
      { datasource: 'jira', filters: [] },
      { datasource: 'gdrive', filters: [] },
    ],
    undefined,
    false,
    terminal,
  );

  try {
    assert.equal(await selection, 'jira');
  } finally {
    logMock.mockRestore();
    terminal.close();
  }
});

void test('rejects a datasource that discovery did not return', async () => {
  await assert.rejects(
    chooseDatasource(
      [{ datasource: 'jira', filters: [] }],
      'gdrive',
      false,
      undefined,
    ),
    /Datasource "gdrive" was not returned/u,
  );
});

void test('formats SDK timeout and connection errors', () => {
  assert.equal(
    formatSdkError(new RequestTimeoutError('request timed out')),
    'The request timed out. Try again or increase the SDK timeout.',
  );
  assert.equal(
    formatSdkError(new ConnectionError('network unreachable')),
    'Could not reach Glean: network unreachable',
  );
});

void test('rejects blank filter flags instead of silently falling back', () => {
  assert.throws(
    () =>
      parseCliOptions([
        '--query',
        'planning',
        '--field',
        ' ',
        '--value',
        'Escalated',
      ]),
    /--field must not be blank/u,
  );
});
