import { loadEnvFile } from 'node:process';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';
import {
  assertBatchCoverage,
  batchRequest,
  readDocumentsBatchResponse,
  type DocumentSpec,
  type DocumentsBatchResponse,
} from './documents.js';
import {
  DocumentsTimeoutError,
  documentsApiError,
  readProblemDetail,
} from './errors.js';

// These experimental document endpoints are not in @gleanwork/api-client.
// client.documents is a different API. Call POST /api/documents/batch with
// fetch. Sign in with @gleanwork/auth. Every request sends
// X-Glean-Include-Experimental: true. A 404 with that header usually means
// your Glean instance has not turned the endpoints on. Ask your Glean admin
// or Glean support.
export const DOCUMENTS_SCOPE = 'documents:read';
export const EXPERIMENTAL_HEADER = 'X-Glean-Include-Experimental';

const REQUEST_TIMEOUT_MS = 30_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface GleanClientTarget {
  email?: string;
  serverUrl?: string;
}

export interface DocumentsClient {
  origin: string;
  batchGet(
    specs: readonly DocumentSpec[],
    includeContent: boolean,
  ): Promise<DocumentsBatchResponse>;
}

function loadDotEnv() {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function assertBackendOrigin(serverURL: string): string {
  let server: URL;
  try {
    server = new URL(serverURL);
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

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  );
}

export async function createDocumentsClient(
  target: GleanClientTarget,
  log: (message: string) => void = () => undefined,
): Promise<DocumentsClient> {
  loadDotEnv();
  const origin = assertBackendOrigin(await resolveServerUrl(target));
  const staticToken = process.env.GLEAN_API_TOKEN?.trim();
  if (staticToken) log('Using GLEAN_API_TOKEN from the environment.');
  else log('Using the OAuth session (documents:read).');

  const getAccessToken = staticToken
    ? () => Promise.resolve(staticToken)
    : createGleanTokenProvider({
        serverUrl: origin,
        scopes: [DOCUMENTS_SCOPE],
      });

  async function request(
    url: URL,
    init: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        body: init.body,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: 'application/json',
          ...init.headers,
          authorization: `Bearer ${await getAccessToken()}`,
          [EXPERIMENTAL_HEADER]: 'true',
        },
      });
    } catch (error) {
      if (isTimeout(error)) throw new DocumentsTimeoutError();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not reach Glean: ${message}`);
    }

    const body = parseJson(await response.text());
    if (!response.ok) throw documentsApiError(response, body);
    if (readProblemDetail(body)) {
      throw new Error('Document response was an error document with HTTP 200.');
    }
    return body;
  }

  return {
    origin,
    async batchGet(specs, includeContent) {
      const payload = batchRequest(specs, includeContent);
      const response = readDocumentsBatchResponse(
        await request(new URL('/api/documents/batch', origin), {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'content-type': 'application/json' },
        }),
        includeContent,
      );
      assertBatchCoverage(payload.document_specs.length, response);
      return response;
    },
  };
}
