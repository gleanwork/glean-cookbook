import {
  ConnectionError,
  GleanBaseError,
  PlatformProblemDetailError,
  RequestTimeoutError,
} from '@gleanwork/api-client/models/errors';
import { GleanApiError } from './api.js';
import { ContractError } from './requests.js';

const HINTS: Record<number, string> = {
  401: 'Set GLEAN_API_TOKEN in .env to a current user-scoped Client API token.',
  403: 'Reviewing and deciding requests needs ADMIN_USAGE_LIMIT_INCREASE_REQUESTS and workspace billing permission (billing edit to approve or deny). Your own requests need USAGE_LIMIT_INCREASE_REQUESTS.',
  404: 'If every command returns 404, the workspace has not turned on spend_limit.requestMore.enabled or this backend does not serve the experimental request APIs yet. Otherwise the request does not exist or you cannot see it.',
  409: 'The request changed, or its month ended before the approval. Run show to read its current state.',
};

/** Converts API, SDK, and contract errors into actionable CLI output. */
export function formatError(error: unknown): string {
  if (error instanceof GleanApiError) {
    return [
      error.status ? `HTTP ${error.status}: ${error.message}` : error.message,
      error.code !== 'unknown' ? `Code: ${error.code}` : undefined,
      error.requestId ? `Request ID: ${error.requestId}` : undefined,
      error.retryAfter ? `Retry after: ${error.retryAfter}` : undefined,
      HINTS[error.status],
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (error instanceof PlatformProblemDetailError) {
    return [
      `HTTP ${error.status}: ${error.detail}`,
      `Code: ${error.code}`,
      `Request ID: ${error.request_id}`,
      error.status === 403
        ? 'Looking up requesters needs the PEOPLE scope.'
        : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (error instanceof GleanBaseError) {
    return `HTTP ${error.statusCode}: ${error.message}`;
  }
  if (error instanceof RequestTimeoutError) {
    return 'The request timed out. Try again.';
  }
  if (error instanceof ConnectionError) {
    return `Could not reach Glean: ${error.message}`;
  }
  if (error instanceof ContractError) {
    return `Glean returned a response this recipe does not recognize: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
