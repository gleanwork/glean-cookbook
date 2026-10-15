export class DocumentsApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryAfter?: string;

  constructor(options: {
    status: number;
    detail: string;
    code?: string;
    requestId?: string;
    retryAfter?: string;
  }) {
    super(options.detail);
    this.name = 'DocumentsApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfter = options.retryAfter;
  }
}

export class DocumentsTimeoutError extends Error {
  constructor() {
    super('The request timed out after 30 seconds.');
    this.name = 'DocumentsTimeoutError';
  }
}

export interface CliError {
  error: string;
  hint?: string;
}

interface ProblemDetail {
  title: string;
  status: number;
  detail: string;
  code: string;
  request_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readProblemDetail(body: unknown): ProblemDetail | undefined {
  if (!isRecord(body)) return undefined;
  const { type, title, status, detail, code, request_id: requestId } = body;
  if (
    typeof type !== 'string' ||
    typeof title !== 'string' ||
    typeof status !== 'number' ||
    typeof detail !== 'string' ||
    typeof code !== 'string' ||
    code.length === 0 ||
    typeof requestId !== 'string' ||
    requestId.length === 0
  ) {
    return undefined;
  }
  return { title, status, detail, code, request_id: requestId };
}

export function documentsApiError(
  response: Response,
  body: unknown,
): DocumentsApiError {
  const problem = readProblemDetail(body);
  const retryAfter = response.headers.get('retry-after') ?? undefined;
  if (problem) {
    return new DocumentsApiError({
      status: response.status,
      detail: problem.detail,
      code: problem.code,
      requestId: problem.request_id,
      retryAfter,
    });
  }
  return new DocumentsApiError({
    status: response.status,
    detail: response.statusText || `HTTP ${response.status}`,
    retryAfter,
  });
}

function hintFor(status: number): string | undefined {
  switch (status) {
    case 401:
      return 'The token is missing or invalid. Run npm run login -- --email <your-work-email>, or set GLEAN_SERVER_URL and a user-scoped GLEAN_API_TOKEN with documents:read.';
    case 403:
      return 'The token cannot read documents. Sign in with the documents:read scope, or use a user-scoped token with that permission.';
    case 400:
      return 'The batch request was rejected. Send 1 to 100 selectors, each exactly one of document_id or url. An empty or malformed URL is a warning on a 200 response, not a 400.';
    case 404:
      return 'The batch call itself failed. A selector the server cannot resolve is a warning on HTTP 200, not a 404. A 404 means the experimental operation is hidden or the route was not found. Send X-Glean-Include-Experimental: true.';
    case 413:
      return 'The request body is too large. A batch holds at most 100 selectors. HTTP 413 means the body exceeded the server size limit.';
    case 429:
      return 'The request was rate limited. Wait, then try again.';
    default:
      return undefined;
  }
}

function formatApiError(error: DocumentsApiError): CliError {
  const summary = error.message.startsWith('HTTP ')
    ? error.message
    : `HTTP ${error.status}: ${error.message}`;
  const lines = [summary];
  if (error.code) lines.push(`Code: ${error.code}`);
  if (error.requestId) lines.push(`Request ID: ${error.requestId}`);
  if (error.retryAfter) lines.push(`Retry after: ${error.retryAfter}`);
  return { error: lines.join('\n'), hint: hintFor(error.status) };
}

export function formatCliError(error: unknown): CliError {
  if (error instanceof DocumentsTimeoutError) return { error: error.message };
  if (error instanceof DocumentsApiError) return formatApiError(error);
  if (
    error instanceof Error &&
    error.cause instanceof DocumentsApiError &&
    error.cause !== error
  ) {
    const inner = formatApiError(error.cause);
    return { error: `${error.message}\n${inner.error}`, hint: inner.hint };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/sign-in is required|access token|GLEAN_API_TOKEN/i.test(message)) {
    return {
      error: message,
      hint: 'Run npm run login -- --email <your-work-email>, or set GLEAN_SERVER_URL and GLEAN_API_TOKEN.',
    };
  }
  return { error: message };
}

export function printCliError(error: unknown, write = console.error): void {
  const formatted = formatCliError(error);
  write(`error: ${formatted.error}`);
  if (formatted.hint) write(`hint: ${formatted.hint}`);
}
