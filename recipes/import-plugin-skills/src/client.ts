import { loadEnvFile } from 'node:process';
import { Glean, type SDKOptions } from '@gleanwork/api-client';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

// Keep these identical to the `login` script in package.json.
export const SCOPES = ['SKILLS'];

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface BackendTarget {
  backend?: string;
  email?: string;
}

export function loadDotEnv() {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Resolve the Glean backend origin from --backend, --email, or GLEAN_SERVER_URL. */
export async function resolveBackend({ backend, email }: BackendTarget) {
  const configured =
    backend?.trim() ||
    (email?.trim()
      ? (await discoverGleanTenant(email.trim())).serverUrl
      : undefined) ||
    process.env.GLEAN_SERVER_URL?.trim();
  if (!configured) {
    throw new Error(
      'Pass --backend with your Glean backend URL, such as https://acme-be.glean.com, or --email to discover it.',
    );
  }
  let server: URL;
  try {
    server = new URL(configured);
  } catch {
    throw new Error('Use a complete Glean backend HTTPS origin.');
  }
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

export function createGleanClient(backend: string) {
  // GLEAN_API_TOKEN is a non-interactive fallback. Otherwise the provider
  // reads and refreshes the credentials that sign-in stored.
  const options = {
    serverURL: backend,
    apiToken:
      process.env.GLEAN_API_TOKEN?.trim() ||
      createGleanTokenProvider({ serverUrl: backend, scopes: SCOPES }),
    timeoutMs: 60_000,
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
  } satisfies SDKOptions;

  return new Glean(options);
}
