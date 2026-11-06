import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createDocumentsClient } from './client.js';
import { formatRetrieval } from './documents.js';
import { DocumentsApiError } from './errors.js';
import { retrieveDocumentByUrl } from './workflow.js';

const originalToken = process.env.GLEAN_API_TOKEN;
const originalServerUrl = process.env.GLEAN_SERVER_URL;
const origin = 'https://fixture.example';
const submittedUrl = 'https://docs.example/alias';
const permalink = 'https://docs.example/wiki/plan';
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

interface CapturedRequest {
  method: string;
  url: string;
  authorization: string | null;
  experimental: string | null;
  contentType: string | null;
}

function documentResponse(
  requestId: string,
  options?: { content?: string[]; documentType?: string | null },
) {
  return {
    request_id: requestId,
    document: {
      document_id: 'doc/1',
      url: permalink,
      title: 'Quarterly plan',
      datasource: 'gdrive',
      document_type:
        options && 'documentType' in options
          ? options.documentType
          : 'Document',
      mime_type: 'text/plain',
      creator: { name: 'Ada Lovelace', id: 'person-1' },
      owner: { name: 'Ada Lovelace' },
      updated_at: '2026-10-01T00:00:00Z',
      created_at: null,
      ...(options && 'content' in options
        ? { content: { full_text_list: options.content ?? [] } }
        : {}),
      extra_field: 'ignored',
    },
  };
}

function problem(
  status: number,
  code: string,
  detail: string,
  headers?: Record<string, string>,
) {
  return HttpResponse.json(
    {
      type: 'https://developers.glean.com/errors/example',
      title: 'Request failed',
      status,
      detail,
      code,
      request_id: 'req-error',
    },
    {
      status,
      headers: { 'content-type': 'application/problem+json', ...headers },
    },
  );
}

async function client() {
  vi.stubEnv('GLEAN_API_TOKEN', 'fixture-token');
  return createDocumentsClient({ serverUrl: origin });
}

test('retrieves by URL, then by the encoded document ID', async () => {
  const calls: CapturedRequest[] = [];
  server.use(
    http.get(`${origin}/api/documents`, ({ request }) => {
      calls.push(capture(request));
      const url = new URL(request.url);
      if (url.searchParams.has('url')) {
        expect(url.searchParams.get('url')).toBe(submittedUrl);
        expect(url.searchParams.get('include')).toBeNull();
        return HttpResponse.json(documentResponse('req-url'));
      }
      return problem(400, 'invalid_parameter', 'Missing url.');
    }),
    http.get(`${origin}/api/documents/:documentId`, ({ request }) => {
      calls.push(capture(request));
      expect(new URL(request.url).pathname).toBe('/api/documents/doc%2F1');
      return HttpResponse.json(documentResponse('req-id'));
    }),
  );

  const result = await retrieveDocumentByUrl(await client(), {
    url: submittedUrl,
    includeContent: false,
  });
  expect(result.byUrl.request_id).toBe('req-url');
  expect(result.byId.document.document_id).toBe('doc/1');
  expect(result.byUrl.document.created_at).toBeNull();
  expect(result.byUrl.document.creator).toEqual({
    name: 'Ada Lovelace',
    id: 'person-1',
  });
  expect(calls).toEqual([
    captured('GET', `${origin}/api/documents?url=${encodeUrl(submittedUrl)}`),
    captured('GET', `${origin}/api/documents/doc%2F1`),
  ]);
  expect(
    formatRetrieval({ submittedUrl, ...result, includeContent: false }),
  ).toContain('Round-trip document_id matches (request req-id).');
  expect(
    formatRetrieval({ submittedUrl, ...result, includeContent: false }),
  ).toContain('The permalink differs from the submitted URL.');
});

test('include=CONTENT is sent on both requests and empty text is success', async () => {
  const includes: Array<string | null> = [];
  server.use(
    http.get(`${origin}/api/documents`, ({ request }) => {
      includes.push(new URL(request.url).searchParams.get('include'));
      return HttpResponse.json(
        documentResponse('req-url', { content: [], documentType: null }),
      );
    }),
    http.get(`${origin}/api/documents/:documentId`, ({ request }) => {
      includes.push(new URL(request.url).searchParams.get('include'));
      return HttpResponse.json(documentResponse('req-id', { content: [] }));
    }),
  );

  const result = await retrieveDocumentByUrl(await client(), {
    url: submittedUrl,
    includeContent: true,
  });
  expect(includes).toEqual(['CONTENT', 'CONTENT']);
  expect(result.byUrl.document.document_type).toBeNull();
  expect(result.byUrl.document.content).toEqual({ full_text_list: [] });
  expect(
    formatRetrieval({ submittedUrl, ...result, includeContent: true }),
  ).toContain('content: no extracted text');
});

test('a content preview is bounded and a missing content object fails the request', async () => {
  const calls: string[] = [];
  server.use(
    http.get(`${origin}/api/documents`, ({ request }) => {
      calls.push(request.url);
      if (new URL(request.url).searchParams.get('include') === 'CONTENT') {
        return HttpResponse.json(documentResponse('req-url'));
      }
      return HttpResponse.json(
        documentResponse('req-url', { content: [`${'a'.repeat(300)} tail`] }),
      );
    }),
  );

  await expect(
    retrieveDocumentByUrl(await client(), {
      url: submittedUrl,
      includeContent: true,
    }),
  ).rejects.toThrow(/document\.content/);
  expect(calls).toHaveLength(1);

  server.use(
    http.get(`${origin}/api/documents`, () =>
      HttpResponse.json(
        documentResponse('req-url', { content: [`${'a'.repeat(300)} tail`] }),
      ),
    ),
    http.get(`${origin}/api/documents/:documentId`, () =>
      HttpResponse.json(
        documentResponse('req-id', { content: [`${'a'.repeat(300)} tail`] }),
      ),
    ),
  );
  const result = await retrieveDocumentByUrl(await client(), {
    url: submittedUrl,
    includeContent: true,
  });
  const formatted = formatRetrieval({
    submittedUrl,
    ...result,
    includeContent: true,
  });
  expect(formatted).toContain('content_segments: 1');
  expect(formatted).toContain(`content_preview: ${'a'.repeat(240)}`);
  expect(formatted).not.toContain('tail');
});

test('HTTP 404 is a failed request and does not print a successful round trip', async () => {
  server.use(
    http.get(`${origin}/api/documents`, ({ request }) => {
      expect(request.headers.get('x-glean-include-experimental')).toBe('true');
      expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
      return problem(
        404,
        'resource_not_found',
        'No visible document for that URL.',
      );
    }),
  );

  const error = await retrieveDocumentByUrl(await client(), {
    url: submittedUrl,
    includeContent: false,
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(DocumentsApiError);
  expect(error).toMatchObject({
    status: 404,
    code: 'resource_not_found',
    requestId: 'req-error',
  });
});

test('a failed ID lookup names the document already retrieved by URL', async () => {
  server.use(
    http.get(`${origin}/api/documents`, () =>
      HttpResponse.json(documentResponse('req-url')),
    ),
    http.get(`${origin}/api/documents/:documentId`, () =>
      problem(404, 'resource_not_found', 'No visible document for that ID.'),
    ),
  );

  await expect(
    retrieveDocumentByUrl(await client(), {
      url: submittedUrl,
      includeContent: false,
    }),
  ).rejects.toThrow(/Retrieved document_id doc\/1 by URL \(request req-url\)/);
});

test('a different document_id on the round trip fails', async () => {
  server.use(
    http.get(`${origin}/api/documents`, () =>
      HttpResponse.json(documentResponse('req-url')),
    ),
    http.get(`${origin}/api/documents/:documentId`, () =>
      HttpResponse.json({
        ...documentResponse('req-id'),
        document: {
          ...documentResponse('req-id').document,
          document_id: 'other',
        },
      }),
    ),
  );

  await expect(
    retrieveDocumentByUrl(await client(), {
      url: submittedUrl,
      includeContent: false,
    }),
  ).rejects.toThrow(/does not match doc\/1/);
});

test('does not follow redirects', async () => {
  server.use(
    http.get(`${origin}/api/documents`, () =>
      HttpResponse.json(documentResponse('req-url'), {
        status: 302,
        headers: { location: 'https://evil.example/collect' },
      }),
    ),
  );

  await expect(
    retrieveDocumentByUrl(await client(), {
      url: submittedUrl,
      includeContent: false,
    }),
  ).rejects.toThrow(/reach Glean|redirect/i);
});

test('429 surfaces Retry-After on the error', async () => {
  server.use(
    http.get(`${origin}/api/documents`, () =>
      problem(429, 'rate_limit_exceeded', 'Slow down.', { 'retry-after': '3' }),
    ),
  );
  const error = await retrieveDocumentByUrl(await client(), {
    url: submittedUrl,
    includeContent: false,
  }).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ status: 429, retryAfter: '3' });
});

function capture(request: Request): CapturedRequest {
  return {
    method: request.method,
    url: request.url,
    authorization: request.headers.get('authorization'),
    experimental: request.headers.get('x-glean-include-experimental'),
    contentType: request.headers.get('content-type'),
  };
}

function captured(method: string, url: string): CapturedRequest {
  return {
    method,
    url,
    authorization: 'Bearer fixture-token',
    experimental: 'true',
    contentType: null,
  };
}

function encodeUrl(value: string) {
  return encodeURIComponent(value).replaceAll('%20', '+');
}
