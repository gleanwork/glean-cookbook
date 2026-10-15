import { expect, test } from 'vitest';
import { DocumentsApiError, formatCliError } from './errors.js';

test('a batch 404 is the call failing, not a per-item miss', () => {
  const formatted = formatCliError(
    new DocumentsApiError({
      status: 404,
      detail: 'Not found.',
      code: 'resource_not_found',
      requestId: 'req-error',
    }),
  );
  expect(formatted.error).toContain('HTTP 404: Not found.');
  expect(formatted.hint).toContain('HTTP 200');
  expect(formatted.hint).toContain('X-Glean-Include-Experimental');
});

test('413 tells the caller the body is too large', () => {
  const formatted = formatCliError(
    new DocumentsApiError({
      status: 413,
      detail: 'Request body is too large.',
      code: 'request_too_large',
      requestId: 'req-large',
    }),
  );
  expect(formatted.error).toContain('Code: request_too_large');
  expect(formatted.hint).toContain('100');
});
