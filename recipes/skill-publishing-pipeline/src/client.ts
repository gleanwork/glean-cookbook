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

async function loadDotEnv() {
  let text: string;
  try {
    text = await fs.readFile(path.join(process.cwd(), '.env'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
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

async function configuredScopes(log: (message: string) => void) {
  const envMode = process.env.GLEAN_SKILLS_SCOPE_MODE?.trim();
  let fileMode: string | undefined;
  try {
    fileMode = (
      await fs.readFile(path.join(process.cwd(), SCOPE_MODE_FILE), 'utf8')
    ).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (envMode && fileMode && envMode !== fileMode) {
    log(
      `GLEAN_SKILLS_SCOPE_MODE=${envMode} overrides .glean-scope-mode (${fileMode}).`,
    );
  } else if (envMode) {
    log(`Using GLEAN_SKILLS_SCOPE_MODE=${envMode}.`);
  } else if (fileMode) {
    log(`Using .glean-scope-mode (${fileMode}).`);
  } else {
    log('Using native skills:read and skills:write scopes.');
  }
  const mode = envMode || fileMode;
  return mode === 'legacy' ? ['SKILLS'] : ['skills:read', 'skills:write'];
}

export async function createGleanClient(
  target: GleanClientTarget,
  log: (message: string) => void = () => undefined,
) {
  await loadDotEnv();
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
  const scopes = await configuredScopes(log);
  if (staticToken) {
    log('Using GLEAN_API_TOKEN from the environment.');
  } else {
    log(`Using the OAuth session (${scopes.join(', ')}).`);
  }

  const options = {
    serverURL: server.origin,
    apiToken:
      staticToken ||
      createGleanTokenProvider({
        serverUrl: server.origin,
        scopes,
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
