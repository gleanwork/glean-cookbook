import fs from 'node:fs/promises';
import path from 'node:path';
import { Glean, type SDKOptions } from '@gleanwork/api-client';
import type { XGleanOptions } from '@gleanwork/api-client/hooks/x-glean-options.js';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const SCOPE_MODE_FILE = '.glean-scope-mode';

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

async function configuredScopes(): Promise<string[]> {
  const envMode = process.env.GLEAN_SKILLS_SCOPE_MODE?.trim();
  let mode = envMode;
  if (!mode) {
    try {
      mode = (
        await fs.readFile(path.join(process.cwd(), SCOPE_MODE_FILE), 'utf8')
      ).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return mode === 'legacy' ? ['SKILLS'] : ['skills:read', 'skills:write'];
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
        scopes: await configuredScopes(),
      }),
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
