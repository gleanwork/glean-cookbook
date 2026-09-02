import { Glean, type SDKOptions } from '@gleanwork/api-client';
import type { XGleanOptions } from '@gleanwork/api-client/hooks/x-glean-options.js';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface GleanClientTarget {
  email?: string;
  serverUrl?: string;
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

export async function createGleanClient(target: GleanClientTarget) {
  const serverURL = await resolveServerUrl(target);
  const server = new URL(serverURL);
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

  const staticToken = process.env.GLEAN_API_TOKEN?.trim();
  const options = {
    serverURL: server.origin,
    apiToken:
      staticToken ||
      createGleanTokenProvider({
        serverUrl: server.origin,
        scopes: ['chat'],
      }),
    includeExperimental: true,
  } satisfies SDKOptions & XGleanOptions;

  return new Glean(options);
}
