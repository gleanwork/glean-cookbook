import { once } from 'node:events';
import { createServer } from 'node:http';
import open from 'open';

export const OAUTH_REDIRECT_URI = new URL(
  'http://127.0.0.1:53682/oauth/callback',
);

export async function authorizeOnLoopback(authorizationUrl: URL) {
  const expectedState = authorizationUrl.searchParams.get('state');
  if (!expectedState) {
    throw new Error('OAuth authorization URL is missing state.');
  }

  let resolveCallback: (url: URL) => void;
  let rejectCallback: (error: Error) => void;
  const callback = new Promise<URL>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', OAUTH_REDIRECT_URI);
    if (
      request.method !== 'GET' ||
      requestUrl.pathname !== OAUTH_REDIRECT_URI.pathname
    ) {
      response.writeHead(404).end();
      return;
    }

    if (requestUrl.searchParams.has('error')) {
      response.writeHead(400, { 'Content-Type': 'text/plain' });
      response.end('Authorization was not granted. Return to the terminal.');
      resolveCallback(requestUrl);
      return;
    }
    if (
      !requestUrl.searchParams.has('code') ||
      requestUrl.searchParams.get('state') !== expectedState
    ) {
      response.writeHead(400, { 'Content-Type': 'text/plain' });
      response.end('Invalid OAuth callback. You can close this tab.');
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Signed in. You can return to the terminal.');
    resolveCallback(requestUrl);
  });

  server.listen(Number(OAUTH_REDIRECT_URI.port), OAUTH_REDIRECT_URI.hostname);
  await once(server, 'listening');
  const timeout = setTimeout(
    () => rejectCallback(new Error('Timed out waiting for Glean sign-in.')),
    300_000,
  );

  try {
    await open(authorizationUrl.toString());
    return await callback;
  } finally {
    clearTimeout(timeout);
    server.close();
    await once(server, 'close');
  }
}
