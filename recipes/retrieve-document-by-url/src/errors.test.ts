import { expect, test } from 'vitest';
import { DocumentsApiError, formatCliError } from './errors.js';

test('formats a problem document without hiding the request ID', () => {
  const formatted = formatCliError(
    new DocumentsApiError({
      status: 404,
      detail: 'No visible document for that URL.',
      code: 'resource_not_found',
      requestId: 'req-error',
    }),
  );
  expect(formatted.error).toContain(
    'HTTP 404: No visible document for that URL.',
  );
  expect(formatted.error).toContain('Code: resource_not_found');
  expect(formatted.error).toContain('Request ID: req-error');
  expect(formatted.hint).toContain('Request ID: req-error');
  expect(formatted.hint).toContain(
    'does not have the experimental document endpoints turned on',
  );
  expect(formatted.hint).toContain('Ask your Glean admin');
  expect(formatted.hint).not.toContain('Send X-Glean-Include-Experimental');
  expect(formatted.hint).toContain('Go links');
});

test('403 names permission, token scope, and instance setup', () => {
  const formatted = formatCliError(
    new DocumentsApiError({
      status: 403,
      detail: 'Forbidden.',
      code: 'forbidden',
      requestId: 'req-forbidden',
    }),
  );
  expect(formatted.error).toContain('Request ID: req-forbidden');
  expect(formatted.hint).toContain('Request ID: req-forbidden');
  expect(formatted.hint).toContain('permission to open the document');
  expect(formatted.hint).toContain('documents:read (legacy label DOCUMENTS)');
  expect(formatted.hint).toContain('Glean instance might not be set up');
  expect(formatted.hint).toContain(
    'OAuth login already requests documents:read',
  );
  expect(formatted.hint).not.toContain('Sign in with the documents:read scope');
});

test('keeps the HTTP hint when the ID lookup fails after a URL hit', () => {
  const formatted = formatCliError(
    new Error(
      'Retrieved document_id doc/1 by URL (request req-url), but get by ID failed.',
      {
        cause: new DocumentsApiError({
          status: 404,
          detail: 'No visible document for that ID.',
          code: 'resource_not_found',
          requestId: 'req-id',
        }),
      },
    ),
  );
  expect(formatted.error).toContain('request req-url');
  expect(formatted.error).toContain(
    'HTTP 404: No visible document for that ID.',
  );
  expect(formatted.hint).toContain('pass the message URL');
  expect(formatted.hint).toContain('Request ID: req-id');
});

test('includes Retry-After on a 429', () => {
  const formatted = formatCliError(
    new DocumentsApiError({
      status: 429,
      detail: 'Slow down.',
      code: 'rate_limit_exceeded',
      requestId: 'req-limit',
      retryAfter: '3',
    }),
  );
  expect(formatted.error).toContain('Retry after: 3');
});
