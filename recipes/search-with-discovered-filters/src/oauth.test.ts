import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { createGleanClient } from './client.js';
import { createOAuthTokenProvider, loginWithOAuth } from './oauth.js';
import { oauthStateFile, readOAuthState } from './oauth-state.js';

void test('registers with DCR and refreshes through the SDK token callback', async () => {
  const originalFetch = globalThis.fetch;
  const originalStateHome = process.env.XDG_STATE_HOME;
  const originalClientId = process.env.GLEAN_OAUTH_CLIENT_ID;
  const originalServerURL = process.env.GLEAN_SERVER_URL;
  const originalApiToken = process.env.GLEAN_API_TOKEN;
  const stateHome = await mkdtemp(path.join(os.tmpdir(), 'glean-oauth-test-'));
  process.env.XDG_STATE_HOME = stateHome;
  delete process.env.GLEAN_OAUTH_CLIENT_ID;

  const requests: Array<{
    path: string;
    body: string;
    authorization: string | undefined;
    experimental: string | undefined;
    authType: string | undefined;
  }> = [];
  let tokenRequests = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: string[] = [];
      request.setEncoding('utf8');
      for await (const chunk of request) chunks.push(String(chunk));
      const body = chunks.join('');
      const requestPath = request.url ?? '';
      requests.push({
        path: requestPath,
        body,
        authorization: request.headers.authorization,
        experimental: request.headers['x-glean-include-experimental'] as
          string | undefined,
        authType: request.headers['x-glean-auth-type'] as string | undefined,
      });

      response.setHeader('Content-Type', 'application/json');
      if (requestPath === '/.well-known/oauth-authorization-server') {
        response.end(
          JSON.stringify({
            issuer: 'https://acme-be.glean.com',
            authorization_endpoint: 'https://acme-be.glean.com/oauth/authorize',
            token_endpoint: 'https://acme-be.glean.com/oauth/token',
            registration_endpoint: 'https://acme-be.glean.com/oauth/register',
            code_challenge_methods_supported: ['S256'],
            scopes_supported: ['openid', 'offline_access', 'SEARCH'],
          }),
        );
        return;
      }
      if (requestPath === '/oauth/register') {
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            client_id: 'registered-client',
            redirect_uris: ['http://127.0.0.1:53682/oauth/callback'],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          }),
        );
        return;
      }
      if (requestPath === '/api/search/filters') {
        response.end(
          JSON.stringify({ request_id: 'filters-request', datasources: [] }),
        );
        return;
      }
      if (requestPath === '/oauth/token') {
        tokenRequests += 1;
        response.end(
          JSON.stringify(
            tokenRequests === 1
              ? {
                  access_token: 'initial-access-token',
                  refresh_token: 'initial-refresh-token',
                  token_type: 'Bearer',
                  expires_in: 1,
                  scope: 'openid offline_access SEARCH',
                }
              : {
                  access_token: 'refreshed-access-token',
                  refresh_token: 'rotated-refresh-token',
                  token_type: 'Bearer',
                  expires_in: 3600,
                  scope: 'openid offline_access SEARCH',
                },
          ),
        );
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    })().catch((error: unknown) => {
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (url.hostname === 'acme-be.glean.com') {
          url.protocol = 'http:';
          url.hostname = '127.0.0.1';
          url.port = String(address.port);
        }
        return originalFetch(new Request(url, request));
      },
    );

  const issuer = new URL('https://acme-be.glean.com');
  try {
    await loginWithOAuth(issuer, (authorizationUrl) => {
      assert.equal(
        authorizationUrl.searchParams.get('scope'),
        'openid offline_access SEARCH',
      );
      const state = authorizationUrl.searchParams.get('state');
      assert.ok(state);
      return Promise.resolve(
        new URL(
          `http://127.0.0.1:53682/oauth/callback?code=authorization-code&state=${state}`,
        ),
      );
    });

    const firstProvider = createOAuthTokenProvider(issuer);
    const secondProvider = createOAuthTokenProvider(issuer);
    assert.deepEqual(await Promise.all([firstProvider(), secondProvider()]), [
      'refreshed-access-token',
      'refreshed-access-token',
    ]);
    assert.equal(tokenRequests, 2);
    assert.equal(
      (await readOAuthState(issuer)).refreshToken,
      'rotated-refresh-token',
    );

    process.env.GLEAN_SERVER_URL = issuer.href;
    delete process.env.GLEAN_API_TOKEN;
    const glean = createGleanClient();
    await glean.search.listFilters();
    const apiRequest = requests.find(
      (request) => request.path === '/api/search/filters',
    );
    assert.equal(apiRequest?.authorization, 'Bearer refreshed-access-token');
    assert.equal(apiRequest?.experimental, 'true');
    assert.equal(apiRequest?.authType, undefined);

    const registration = requests.find(
      (request) => request.path === '/oauth/register',
    );
    assert.ok(registration);
    assert.deepEqual(JSON.parse(registration.body), {
      client_name: 'Glean Search cookbook recipe',
      redirect_uris: ['http://127.0.0.1:53682/oauth/callback'],
      response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
      scope: 'openid offline_access SEARCH',
    });

    const grants = requests
      .filter((request) => request.path === '/oauth/token')
      .map((request) => new URLSearchParams(request.body).get('grant_type'));
    assert.deepEqual(grants, ['authorization_code', 'refresh_token']);

    if (process.platform !== 'win32') {
      const mode = (await stat(oauthStateFile(issuer))).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  } finally {
    fetchMock.mockRestore();
    server.close();
    await once(server, 'close');
    await rm(stateHome, { recursive: true, force: true });
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    if (originalClientId === undefined)
      delete process.env.GLEAN_OAUTH_CLIENT_ID;
    else process.env.GLEAN_OAUTH_CLIENT_ID = originalClientId;
    if (originalServerURL === undefined) delete process.env.GLEAN_SERVER_URL;
    else process.env.GLEAN_SERVER_URL = originalServerURL;
    if (originalApiToken === undefined) delete process.env.GLEAN_API_TOKEN;
    else process.env.GLEAN_API_TOKEN = originalApiToken;
  }
});
