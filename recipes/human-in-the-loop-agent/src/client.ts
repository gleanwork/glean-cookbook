import { loadEnvFile } from 'node:process';
import type { SDKOptions } from '@gleanwork/api-client';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

// Must match the package.json login script and recipe.json scopes. `agents`
// covers starting a run, reading it, and answering or cancelling it.
export const SCOPES = ['agents'];

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export class RecipeError extends Error {}

export interface Target {
  agentId?: string;
  email?: string;
  serverUrl?: string;
}

export interface Settings {
  serverURL: string;
  apiToken: NonNullable<SDKOptions['apiToken']>;
  agentId: string;
}

/** Reads the optional project .env (agent ID, backend, token fallback). */
export function loadDotEnv(): void {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function resolveServerUrl(target: Target, env: NodeJS.ProcessEnv) {
  const explicit = target.serverUrl?.trim();
  if (explicit) return explicit;

  const workEmail = target.email?.trim();
  if (workEmail) return (await discoverGleanTenant(workEmail)).serverUrl;

  const configured = env.GLEAN_SERVER_URL?.trim();
  if (configured) return configured;

  throw new RecipeError(
    'Pass --email or --server-url, or set GLEAN_SERVER_URL in .env.',
  );
}

function assertBackendOrigin(value: string): URL {
  let server: URL;
  try {
    server = new URL(value);
  } catch {
    throw new RecipeError('Use a complete Glean backend HTTPS origin.');
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
    throw new RecipeError('Use a complete Glean backend HTTPS origin.');
  }
  return server;
}

/**
 * Resolves the agent, backend, and credential. The OAuth session from
 * `npm run login` refreshes itself, which matters here: a run can wait for
 * review longer than one access token lives. GLEAN_API_TOKEN is only a
 * non-interactive fallback.
 */
export async function resolveSettings(
  target: Target,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Settings> {
  const agentId = target.agentId?.trim() || env.GLEAN_AGENT_ID?.trim();
  if (!agentId) {
    throw new RecipeError(
      'Pass --agent-id (or set GLEAN_AGENT_ID in .env) to the agent you saved in Agent Builder.',
    );
  }
  const server = assertBackendOrigin(await resolveServerUrl(target, env));
  const staticToken = env.GLEAN_API_TOKEN?.trim();
  return {
    serverURL: server.origin,
    apiToken:
      staticToken ||
      createGleanTokenProvider({ serverUrl: server.origin, scopes: SCOPES }),
    agentId,
  };
}
