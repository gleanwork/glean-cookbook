import {
  ConnectionError,
  GleanBaseError,
  PlatformProblemDetailError,
  RequestTimeoutError,
} from '@gleanwork/api-client/models/errors';

export class CleanupFailedError extends Error {
  readonly remainingIds: string[];
  readonly cleanupCommand: string;
  readonly workError?: unknown;

  constructor(
    remainingIds: string[],
    cleanupCommand: string,
    workError?: unknown,
  ) {
    super(
      `Cleanup did not delete ${remainingIds.join(', ')}. Those IDs remain in your instance.`,
    );
    this.name = 'CleanupFailedError';
    this.remainingIds = remainingIds;
    this.cleanupCommand = cleanupCommand;
    this.workError = workError;
  }
}

export interface CliError {
  error: string;
  hint?: string;
}

export function httpStatus(error: unknown): number | undefined {
  if (error instanceof PlatformProblemDetailError) return error.status;
  if (error instanceof GleanBaseError) return error.statusCode;
  return undefined;
}

function httpSummary(error: GleanBaseError): string {
  try {
    const parsed = JSON.parse(error.body) as {
      detail?: string;
      title?: string;
    };
    const detail = parsed.detail?.trim() || parsed.title?.trim();
    if (detail) return `HTTP ${error.statusCode}: ${detail}`;
  } catch {
    // Fall through to status-only output so the raw SDK body never prints.
  }
  return `HTTP ${error.statusCode}`;
}

function statusHint(status: number | undefined): string | undefined {
  switch (status) {
    case 401:
      return 'Sign in again with npm run login -- --email <your-work-email>.';
    case 403:
      return 'This account or token cannot create skills. Ask an admin for the SKILLS scope or permission.';
    case 404:
      return 'A 404 can mean Skills is not enabled for this instance, or the skill ID is wrong.';
    case 409:
      return 'A skill with this name was imported from GitHub. Sync that skill in Glean instead of uploading over it.';
    case 413:
      return 'The skill bundle is too large for this instance.';
    case 429:
      return 'The instance is rate-limiting requests. Wait, then run the import again.';
    default:
      return undefined;
  }
}

function isMissingOAuthSession(message: string) {
  return (
    /OAuth sign-in is required/i.test(message) ||
    /Unable to obtain a Glean access token/i.test(message)
  );
}

export function formatCliError(error: unknown): CliError {
  if (error instanceof CleanupFailedError) {
    return {
      error: error.message,
      hint: `Delete only those captured IDs. Pass the same --email or --server-url you used to sign in:\n  ${error.cleanupCommand}`,
    };
  }
  if (error instanceof PlatformProblemDetailError) {
    return {
      error: `HTTP ${error.status}: ${error.detail}`,
      hint: statusHint(error.status),
    };
  }
  if (error instanceof GleanBaseError) {
    return { error: httpSummary(error), hint: statusHint(error.statusCode) };
  }
  if (error instanceof RequestTimeoutError) {
    return { error: 'The request timed out. Try again.' };
  }
  if (error instanceof ConnectionError) {
    return { error: `Could not reach Glean: ${error.message}` };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (isMissingOAuthSession(message)) {
    return {
      error: message,
      hint: 'Run npm run login -- --email <your-work-email>.',
    };
  }
  return { error: message };
}

export function printCliError(error: unknown, write = console.error): void {
  if (error instanceof CleanupFailedError && error.workError) {
    const work = formatCliError(error.workError);
    write(`error: ${work.error}`);
    if (work.hint) write(`hint: ${work.hint}`);
  }
  const formatted = formatCliError(error);
  write(`error: ${formatted.error}`);
  if (formatted.hint) write(`hint: ${formatted.hint}`);
}
