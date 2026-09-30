import {
  ConnectionError,
  GleanBaseError,
  PlatformProblemDetailError,
  PlatformUnauthorizedAgentToolsProblemError,
  RequestTimeoutError,
  ResponseValidationError,
  SDKValidationError,
} from '@gleanwork/api-client/models/errors';
import { RecipeError } from './client.js';
import { safeForTerminal } from './review.js';

export interface CliError {
  error: string;
  hint?: string;
}

const LOGIN = 'npm run login -- --email <your-work-email>';

const STATUS = '`npm start -- status` with the same --agent-id and --run-id';

const STATUS_HINTS: Record<number, string> = {
  401: `Sign in again with ${LOGIN}.`,
  403: `Sign in with the agents scope (${LOGIN}), and check that you can use this agent.`,
  404: 'Check the agent ID and run ID. You can only read runs you started.',
  409: `The run changed state. Check it with ${STATUS} before deciding again.`,
  429: `Rate limited. Wait a minute, then check the run with ${STATUS}.`,
  503: `Glean is temporarily unavailable. Wait, then check the run with ${STATUS} before trying again.`,
};

function statusHint(status: number, detail: string): string | undefined {
  // Durable runs are new; an older Glean deployment rejects the field.
  if (status === 400 && /execution_mode/i.test(detail)) {
    return 'Durable runs are not available on your Glean instance yet.';
  }
  return STATUS_HINTS[status];
}

/**
 * Turns an error into one line plus an optional next step. SDK and server
 * errors can carry tool arguments or tokens, so this never prints a raw body.
 */
export function formatCliError(error: unknown): CliError {
  if (error instanceof RecipeError) return { error: error.message };

  if (error instanceof PlatformUnauthorizedAgentToolsProblemError) {
    return {
      error: `HTTP 422: ${safeForTerminal(error.detail)}`,
      hint: "Connect the agent's apps to your Glean account (for this recipe, Slack), then start a new run.",
    };
  }

  if (error instanceof PlatformProblemDetailError) {
    const detail = safeForTerminal(error.detail);
    return {
      error: `HTTP ${error.status}: ${detail}`,
      hint: statusHint(error.status, detail),
    };
  }

  if (
    error instanceof ResponseValidationError ||
    error instanceof SDKValidationError
  ) {
    return {
      error: 'Glean returned a response this SDK version could not read.',
      hint: 'Check that @gleanwork/api-client matches the pinned version, and that durable runs are available on your Glean instance. Nothing was retried.',
    };
  }

  if (
    error instanceof RequestTimeoutError ||
    error instanceof ConnectionError
  ) {
    return {
      error:
        'Could not reach Glean, so the outcome of this request is unknown.',
      hint: `Check the run with ${STATUS} before starting another one. Nothing was retried.`,
    };
  }

  if (error instanceof GleanBaseError) {
    return {
      error: `HTTP ${error.statusCode}`,
      hint: STATUS_HINTS[error.statusCode],
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (
    /OAuth sign-in is required|Unable to obtain a Glean access token/i.test(
      message,
    )
  ) {
    return { error: 'You are not signed in.', hint: `Run ${LOGIN}.` };
  }
  return { error: safeForTerminal(message) };
}

export function printCliError(error: unknown, write = console.error): void {
  const { error: message, hint } = formatCliError(error);
  write(`error: ${message}`);
  if (hint) write(`hint: ${hint}`);
}
