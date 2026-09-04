import {
  ConnectionError,
  GleanBaseError,
  PlatformProblemDetailError,
  RequestTimeoutError,
} from '@gleanwork/api-client/models/errors';

export class CleanupFailedError extends Error {
  readonly remainingIds: string[];
  readonly cleanupCommand: string;

  constructor(remainingIds: string[], cleanupCommand: string) {
    super(
      `Cleanup did not delete ${remainingIds.join(', ')}. Those IDs remain in your tenant.`,
    );
    this.name = 'CleanupFailedError';
    this.remainingIds = remainingIds;
    this.cleanupCommand = cleanupCommand;
  }
}

export interface CliError {
  error: string;
  hint?: string;
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

export function formatCliError(error: unknown): CliError {
  if (error instanceof CleanupFailedError) {
    return {
      error: error.message,
      hint: `Delete only those captured IDs:\n  ${error.cleanupCommand}`,
    };
  }

  if (error instanceof PlatformProblemDetailError) {
    return {
      error: `HTTP ${error.status}: ${error.detail}`,
      hint:
        error.status === 404
          ? 'This client already opts into experimental APIs. A 404 can mean Skills APIs are not enabled for this tenant, or the exact skill ID is wrong.'
          : undefined,
    };
  }

  if (error instanceof GleanBaseError) {
    return {
      error: httpSummary(error),
      hint:
        error.statusCode === 404
          ? 'This client already opts into experimental APIs. A 404 can mean Skills APIs are not enabled for this tenant, or the exact skill ID is wrong.'
          : undefined,
    };
  }

  if (error instanceof RequestTimeoutError) {
    return {
      error: 'The request timed out. Try again or increase the SDK timeout.',
    };
  }

  if (error instanceof ConnectionError) {
    return { error: `Could not reach Glean: ${error.message}` };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/OAuth sign-in is required/i.test(message)) {
    return {
      error: message,
      hint: 'Run npm run login -- --email <your-work-email>.',
    };
  }

  return { error: message };
}

export function missingCleanupConfirmation(isTTY: boolean): string {
  return isTTY
    ? 'This run deletes the skill it creates. Confirm in the prompt, or pass --yes.'
    : 'Verification requires --yes to confirm cleanup when the terminal is not interactive.';
}

export function printCliError(error: unknown, write = console.error): void {
  const formatted = formatCliError(error);
  write(`error: ${formatted.error}`);
  if (formatted.hint) write(`hint: ${formatted.hint}`);
}
