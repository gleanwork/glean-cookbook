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
  expect(formatted.error).toContain('Request ID: req-error');
  expect(formatted.hint).not.toContain('Request ID:');
  expect(formatted.hint).toContain('HTTP 200');
  expect(formatted.hint).toContain(
    'does not have the experimental document endpoints turned on',
  );
  expect(formatted.hint).toContain('Ask your Glean admin or Glean support');
  expect(formatted.hint).not.toContain('Send X-Glean-Include-Experimental');
  expect(formatted.hint).not.toContain('to enable them');
});

test('403 names token scope and instance setup', () => {
  const formatted = formatCliError(
    new DocumentsApiError({
      status: 403,
      detail: 'Forbidden.',
      code: 'forbidden',
      requestId: 'req-forbidden',
    }),
  );
  expect(formatted.error).toContain('Request ID: req-forbidden');
  expect(formatted.hint).not.toContain('Request ID:');
  expect(formatted.hint).not.toContain('permission to open the document');
  expect(formatted.hint).toContain('documents:read (legacy label DOCUMENTS)');
  expect(formatted.hint).toContain('Glean instance might not be set up');
  expect(formatted.hint).toContain(
    'OAuth login already requests documents:read',
  );
  expect(formatted.hint).not.toContain('Sign in with the documents:read scope');
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
