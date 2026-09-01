import { Glean, HTTPClient, type SDKOptions } from '@gleanwork/api-client';
import type { XGleanOptions } from '@gleanwork/api-client/hooks/x-glean-options.js';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface GleanClientTarget {
  email?: string;
  serverUrl?: string;
}

export interface ResponseBodyCapture {
  capture(stream: ReadableStream<Uint8Array>): void;
  reject(error: unknown): void;
  waitForStream(): Promise<ReadableStream<Uint8Array>>;
}

export function createResponseBodyCapture(): ResponseBodyCapture {
  let capturedStream: ReadableStream<Uint8Array> | undefined;
  let failure: Error | undefined;
  let resolveStream: (
    value: ReadableStream<Uint8Array> | PromiseLike<ReadableStream<Uint8Array>>,
  ) => void;
  let rejectStream: (reason?: unknown) => void;

  const streamPromise = new Promise<ReadableStream<Uint8Array>>(
    (resolve, reject) => {
      resolveStream = resolve;
      rejectStream = reject;
    },
  );

  return {
    capture(value) {
      capturedStream = value;
      resolveStream(value);
    },
    reject(error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      failure = reason;
      rejectStream(reason);
    },
    waitForStream() {
      if (capturedStream) return Promise.resolve(capturedStream);
      if (failure) return Promise.reject(failure);
      return streamPromise;
    },
  };
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
  streamCapture?: ResponseBodyCapture,
) {
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
    httpClient: streamCapture
      ? new HTTPClient({
          fetcher: async (input) => {
            const request =
              input instanceof Request ? input : new Request(input);
            const response = await fetch(request);
            const acceptsEventStream =
              request.headers.get('accept') === 'text/event-stream';
            if (!acceptsEventStream || !response.body) return response;

            const [sdkBody, consumerBody] = response.body.tee();
            streamCapture.capture(consumerBody);
            return new Response(sdkBody, {
              headers: response.headers,
              status: response.status,
              statusText: response.statusText,
            });
          },
        })
      : undefined,
  } satisfies SDKOptions & XGleanOptions;

  return new Glean(options);
}
