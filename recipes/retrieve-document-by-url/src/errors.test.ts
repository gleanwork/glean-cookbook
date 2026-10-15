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
  expect(formatted.hint).toContain('X-Glean-Include-Experimental');
  expect(formatted.hint).toContain('go-link');
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
  expect(formatted.hint).toContain('caller-specific IDs');
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
