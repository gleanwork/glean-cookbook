import { loadEnvFile } from 'node:process';
import { Glean, type SDKOptions } from '@gleanwork/api-client';
import type { XGleanOptions } from '@gleanwork/api-client/hooks/x-glean-options.js';
import { PlatformProblemDetailError } from '@gleanwork/api-client/models/errors';
import { createUsageRequestsApi, GleanApiError } from './api.js';
import type { Person } from './commands.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function loadDotEnv() {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function backendOrigin(serverUrl: string | undefined) {
  if (!serverUrl) {
    throw new Error(
      'Set GLEAN_SERVER_URL in .env to your Glean backend origin.',
    );
  }
  const server = new URL(serverUrl);
  const loopback = LOOPBACK_HOSTS.has(server.hostname);
  if (
    (server.protocol !== 'https:' && !loopback) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    (server.pathname && server.pathname !== '/') ||
    (!loopback && server.port)
  ) {
    throw new Error('Use a complete Glean backend HTTPS origin.');
  }
  return server.origin;
}

/**
 * Creates the SDK client for directory reads and the REST bridge for the
 * request operations. Both send the user-scoped Client API token from .env.
 */
export function connect() {
  loadDotEnv();
  const origin = backendOrigin(process.env.GLEAN_SERVER_URL?.trim());
  const token = process.env.GLEAN_API_TOKEN?.trim();
  if (!token) {
    throw new GleanApiError(
      'Set GLEAN_API_TOKEN in .env to a user-scoped Client API token.',
      401,
      'missing_credentials',
    );
  }

  const options = {
    serverURL: origin,
    apiToken: token,
    includeExperimental: true,
  } satisfies SDKOptions & XGleanOptions;

  return {
    origin,
    glean: new Glean(options),
    requests: createUsageRequestsApi({ origin, token }),
  };
}

/** Looks up a requester. Requests outlive people; a deleted user returns 404. */
export function directoryLookup(glean: Glean) {
  return async (userId: string): Promise<Person | undefined> => {
    try {
      return (await glean.users.get(userId)).user;
    } catch (error) {
      if (error instanceof PlatformProblemDetailError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  };
}
