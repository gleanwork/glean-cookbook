import {
  GleanBaseError,
  PlatformProblemDetailError,
} from '@gleanwork/api-client/models/errors';

/** Format the SDK's typed errors without reimplementing its HTTP handling. */
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
  return error instanceof Error ? error.message : String(error);
}
