import {
  ConnectionError,
  GleanBaseError,
  PlatformProblemDetailError,
  RequestTimeoutError,
} from '@gleanwork/api-client/models/errors';

/** Converts typed SDK errors into actionable CLI output. */
export function formatSdkError(error: unknown): string {
  if (error instanceof PlatformProblemDetailError) {
    const retryAfter = error.headers.get('retry-after');
    return [
      `HTTP ${error.status}: ${error.detail}`,
      `Code: ${error.code}`,
      `Request ID: ${error.request_id}`,
      retryAfter ? `Retry after: ${retryAfter}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (error instanceof GleanBaseError) {
    return `HTTP ${error.statusCode}: ${error.message}`;
  }
  if (error instanceof RequestTimeoutError) {
    return 'The request timed out. Try again or increase the SDK timeout.';
  }
  if (error instanceof ConnectionError) {
    return `Could not reach Glean: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
