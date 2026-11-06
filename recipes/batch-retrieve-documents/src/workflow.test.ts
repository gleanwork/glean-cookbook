import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createDocumentsClient } from './client.js';
import {
  assertDocumentSpecs,
  formatBatch,
  MAX_DOCUMENT_SPECS,
  type DocumentSpec,
} from './documents.js';
import { DocumentsApiError } from './errors.js';
import { batchRetrieveDocuments } from './workflow.js';

const originalToken = process.env.GLEAN_API_TOKEN;
const originalServerUrl = process.env.GLEAN_SERVER_URL;
const origin = 'https://fixture.example';
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
  if (originalServerUrl === undefined) delete process.env.GLEAN_SERVER_URL;
  else process.env.GLEAN_SERVER_URL = originalServerUrl;
});

afterAll(() => {
  server.close();
});

function document(documentId: string, content?: string[]) {
  return {
    document_id: documentId,
    url: `https://docs.example/${documentId}`,
    title: `Title ${documentId}`,
    datasource: 'gdrive',
    document_type: 'Document',
    updated_at: '2026-10-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    ...(content ? { content: { full_text_list: content } } : {}),
  };
}

function problem(status: number, code: string, detail: string) {
  return HttpResponse.json(
    {
      type: 'https://developers.glean.com/errors/example',
      title: 'Request failed',
      status,
      detail,
      code,
      request_id: 'req-error',
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

async function client() {
  vi.stubEnv('GLEAN_API_TOKEN', 'fixture-token');
  return createDocumentsClient({ serverUrl: origin });
}

test('posts mixed selectors and reports results and warnings', async () => {
  const specs: DocumentSpec[] = [
    { url: 'https://docs.example/wiki/plan' },
    { document_id: 'doc/1' },
    { url: '' },
    { url: 'https://example.invalid/not-indexed' },
  ];
  let body: unknown;
  server.use(
    http.post(`${origin}/api/documents/batch`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
      expect(request.headers.get('x-glean-include-experimental')).toBe('true');
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(new URL(request.url).search).toBe('');
      body = await request.json();
      return HttpResponse.json({
        request_id: 'req-batch',
        results: [
          { index: 0, document: document('plan') },
          { index: 1, document: document('doc/1') },
        ],
        warnings: [
          {
            code: 'invalid_parameter',
            message: 'URL is empty.',
            context: { index: 2, url: '' },
          },
          {
            code: 'resource_not_found',
            message: 'No visible document for that URL.',
            context: {
              index: 3,
              url: 'https://example.invalid/not-indexed',
            },
          },
        ],
      });
    }),
  );

  const response = await batchRetrieveDocuments(await client(), {
    specs,
    includeContent: false,
  });
  expect(body).toEqual({
    document_specs: [
      { url: 'https://docs.example/wiki/plan' },
      { document_id: 'doc/1' },
      { url: '' },
      { url: 'https://example.invalid/not-indexed' },
    ],
  });
  const formatted = formatBatch(response, specs.length, false);
  expect(formatted).toContain('Retrieved 2 of 4 documents.');
  expect(formatted).toContain('request_id: req-batch');
  expect(formatted).toContain('[2] invalid_parameter: URL is empty. url=');
  expect(formatted).toContain(
    '[3] resource_not_found: No visible document for that URL. url=https://example.invalid/not-indexed',
  );
  expect(formatted).not.toMatch(/['"]FOUND['"]/);
});

test('include CONTENT is a body field and empty text stays a result', async () => {
  const specs: DocumentSpec[] = [{ document_id: 'doc/1' }];
  let body: unknown;
  server.use(
    http.post(`${origin}/api/documents/batch`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        request_id: 'req-content',
        results: [{ index: 0, document: document('doc/1', []) }],
        warnings: [],
      });
    }),
  );

  const response = await batchRetrieveDocuments(await client(), {
    specs,
    includeContent: true,
  });
  expect(body).toEqual({
    document_specs: [{ document_id: 'doc/1' }],
    include: ['CONTENT'],
  });
  expect(response.results[0]?.document.content).toEqual({ full_text_list: [] });
  expect(formatBatch(response, 1, true)).toContain('content_segments: 0');
});

test('missing requested content fails the batch instead of omitting it', async () => {
  server.use(
    http.post(`${origin}/api/documents/batch`, () =>
      HttpResponse.json({
        request_id: 'req-content',
        results: [{ index: 0, document: document('doc/1') }],
        warnings: [],
      }),
    ),
  );

  await expect(
    batchRetrieveDocuments(await client(), {
      specs: [{ url: 'https://docs.example/wiki/plan' }],
      includeContent: true,
    }),
  ).rejects.toThrow(/content/);
});

test('an HTTP error is not a partial warning', async () => {
  server.use(
    http.post(`${origin}/api/documents/batch`, () =>
      problem(400, 'invalid_request', 'document_specs has too many items.'),
    ),
  );

  const error = await batchRetrieveDocuments(await client(), {
    specs: [{ document_id: 'doc/1' }],
    includeContent: false,
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(DocumentsApiError);
  expect(error).toMatchObject({ status: 400, code: 'invalid_request' });
});

test('413 is a failed request', async () => {
  server.use(
    http.post(`${origin}/api/documents/batch`, () =>
      problem(413, 'request_too_large', 'Request body is too large.'),
    ),
  );
  await expect(
    batchRetrieveDocuments(await client(), {
      specs: [{ url: 'https://docs.example/wiki/plan' }],
      includeContent: false,
    }),
  ).rejects.toMatchObject({ status: 413, code: 'request_too_large' });
});

test('rejects an empty batch and a batch over 100 before any request', () => {
  expect(() => assertDocumentSpecs([])).toThrow(/1 to 100/);
  const tooMany = Array.from(
    { length: MAX_DOCUMENT_SPECS + 1 },
    (_, index) => ({
      document_id: `doc-${index}`,
    }),
  );
  expect(() => assertDocumentSpecs(tooMany)).toThrow(/1 to 100/);
});

test('a 200 that drops or repeats an index is not a successful batch', async () => {
  server.use(
    http.post(`${origin}/api/documents/batch`, () =>
      HttpResponse.json({
        request_id: 'req-batch',
        results: [{ index: 0, document: document('doc/1') }],
        warnings: [],
      }),
    ),
  );
  await expect(
    batchRetrieveDocuments(await client(), {
      specs: [{ document_id: 'doc/1' }, { url: 'https://docs.example/other' }],
      includeContent: false,
    }),
  ).rejects.toThrow(/omitted document_specs index 1/);

  server.use(
    http.post(`${origin}/api/documents/batch`, () =>
      HttpResponse.json({
        request_id: 'req-batch',
        results: [{ index: 0, document: document('doc/1') }],
        warnings: [
          {
            code: 'resource_not_found',
            message: 'Missing.',
            context: { index: 0, document_id: 'doc/1' },
          },
        ],
      }),
    ),
  );
  await expect(
    batchRetrieveDocuments(await client(), {
      specs: [{ document_id: 'doc/1' }],
      includeContent: false,
    }),
  ).rejects.toThrow(/appears more than once/);
});

test('does not follow redirects', async () => {
  server.use(
    http.post(
      `${origin}/api/documents/batch`,
      () =>
        new HttpResponse(null, {
          status: 302,
          headers: { location: 'https://evil.example/collect' },
        }),
    ),
  );
  await expect(
    batchRetrieveDocuments(await client(), {
      specs: [{ url: 'https://docs.example/wiki/plan' }],
      includeContent: false,
    }),
  ).rejects.toThrow(/reach Glean|redirect/i);
});
