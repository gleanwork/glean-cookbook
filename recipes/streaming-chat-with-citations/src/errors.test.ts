import {
  ConnectionError,
  GleanBaseError,
  PlatformProblemDetailError,
  RequestTimeoutError,
} from '@gleanwork/api-client/models/errors';
import { describe, expect, test } from 'vitest';
import { formatSdkError } from './errors.js';

function httpMeta(status: number, headers?: HeadersInit) {
  const response = new Response(null, { headers, status });
  return {
    request: new Request('https://fixture.glean.example.com/api/chat'),
    response,
    body: '',
  };
}

describe('formatSdkError', () => {
  test('reports platform problem details and retry metadata', () => {
    const error = new PlatformProblemDetailError(
      {
        type: 'https://errors.glean.com/invalid-request',
        title: 'Invalid request',
        status: 429,
        detail: 'The Chat service is rate limited.',
        code: 'invalid_request',
        request_id: 'request_fixture',
      },
      httpMeta(429, { 'retry-after': '5' }),
    );

    expect(formatSdkError(error)).toBe(
      'HTTP 429: The Chat service is rate limited.\n' +
        'Code: invalid_request\n' +
        'Request ID: request_fixture\n' +
        'Retry after: 5',
    );
  });

  test('reports generic HTTP errors', () => {
    expect(
      formatSdkError(new GleanBaseError('Unauthorized', httpMeta(401))),
    ).toBe('HTTP 401: Unauthorized');
  });

  test('reports transport failures separately from HTTP failures', () => {
    expect(formatSdkError(new RequestTimeoutError('timed out'))).toBe(
      'The request timed out. Try again or increase the SDK timeout.',
    );
    expect(formatSdkError(new ConnectionError('offline'))).toBe(
      'Could not reach Glean: offline',
    );
  });

  test('falls back to ordinary Error and unknown values', () => {
    expect(formatSdkError(new Error('unexpected'))).toBe('unexpected');
    expect(formatSdkError({ reason: 'unexpected' })).toBe('[object Object]');
  });
});
