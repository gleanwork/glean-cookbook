import { loadEnvFile } from 'node:process';
import { Glean, type SDKOptions } from '@gleanwork/api-client';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

// Keep these identical to the `login` script in package.json.
export const SCOPES = ['SKILLS'];

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface GleanClientTarget {
  email?: string;
  serverUrl?: string;
}

function loadDotEnv() {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function resolveServerUrl({ email, serverUrl }: GleanClientTarget) {
  const explicit = serverUrl?.trim();
  if (explicit) return explicit;

  const workEmail = email?.trim();
  if (workEmail) return (await discoverGleanTenant(workEmail)).serverUrl;

  const configured = process.env.GLEAN_SERVER_URL?.trim();
  if (configured) return configured;

  throw new Error(
    'Pass --email or --server-url, or set GLEAN_SERVER_URL in your environment.',
  );
}

export async function createGleanClient(
  target: GleanClientTarget,
  log: (message: string) => void = () => undefined,
) {
  loadDotEnv();
  const server = new URL(await resolveServerUrl(target));
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

  // GLEAN_API_TOKEN is a non-interactive fallback. Otherwise the provider
  // reads and refreshes the credentials that `npm run login` stored.
  const staticToken = process.env.GLEAN_API_TOKEN?.trim();
  if (staticToken) log('Using GLEAN_API_TOKEN from the environment.');
  else log(`Using the OAuth session (${SCOPES.join(', ')}).`);

  const options = {
    serverURL: server.origin,
    apiToken:
      staticToken ||
      createGleanTokenProvider({ serverUrl: server.origin, scopes: SCOPES }),
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
