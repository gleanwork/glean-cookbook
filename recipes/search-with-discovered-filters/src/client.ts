import 'dotenv/config';
import { Glean, type SDKOptions } from '@gleanwork/api-client';
import type { XGleanOptions } from '@gleanwork/api-client/hooks/x-glean-options.js';
import { createOAuthTokenProvider } from './oauth.js';
import { parseGleanServerURL } from './server-url.js';

export function createGleanClient() {
  const serverURL = process.env.GLEAN_SERVER_URL?.trim();
  if (!serverURL) {
    throw new Error('Set GLEAN_SERVER_URL in your environment or .env file.');
  }

  const server = parseGleanServerURL(serverURL, { allowLoopback: true });

  const staticToken = process.env.GLEAN_API_TOKEN?.trim();
  const options = {
    serverURL: server.href,
    apiToken: staticToken || createOAuthTokenProvider(server),
    includeExperimental: true,
    timeoutMs: 30_000,
    retryConfig: {
      strategy: 'backoff',
      backoff: {
        initialInterval: 500,
        maxInterval: 5_000,
        exponent: 2,
        maxElapsedTime: 90_000,
      },
      retryConnectionErrors: true,
    },
  } satisfies SDKOptions & XGleanOptions;

  return new Glean(options);
}
