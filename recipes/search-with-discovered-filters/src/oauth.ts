import * as oauth from 'openid-client';
import { authorizeOnLoopback, OAUTH_REDIRECT_URI } from './oauth-loopback.js';
import {
  readOAuthState,
  type StoredOAuthState,
  withOAuthStateLock,
  writeOAuthState,
} from './oauth-state.js';

const OAUTH_SCOPE = 'openid offline_access SEARCH';
const EXPIRY_SKEW_MS = 60_000;

const clientMetadata = {
  client_name: 'Glean Search cookbook recipe',
  redirect_uris: [OAUTH_REDIRECT_URI.href],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  scope: OAUTH_SCOPE,
} satisfies Partial<oauth.ClientMetadata>;

function requestOptions() {
  return { algorithm: 'oauth2' as const, timeout: 30 };
}

function assertOAuthCapabilities(config: oauth.Configuration) {
  if (!config.serverMetadata().supportsPKCE('S256')) {
    throw new Error('The Glean OAuth server must support PKCE with S256.');
  }
  const supportedScopes = config.serverMetadata().scopes_supported;
  if (supportedScopes && !supportedScopes.includes('SEARCH')) {
    throw new Error('The Glean OAuth server does not advertise SEARCH scope.');
  }
}

async function discoverRegisteredClient(issuer: URL, state: StoredOAuthState) {
  if (!state.clientId) {
    throw new Error('No OAuth client is registered. Run npm run login first.');
  }
  const config = await oauth.discovery(
    issuer,
    state.clientId,
    clientMetadata,
    oauth.None(),
    requestOptions(),
  );
  assertOAuthCapabilities(config);
  return config;
}

async function registerOrDiscoverClient(issuer: URL, state: StoredOAuthState) {
  const configuredClientId = process.env.GLEAN_OAUTH_CLIENT_ID?.trim();
  const reusableClientId =
    state.redirectUri === OAUTH_REDIRECT_URI.href &&
    state.registrationScope === OAUTH_SCOPE
      ? state.clientId
      : undefined;
  const clientId = configuredClientId ?? reusableClientId;

  const config = clientId
    ? await oauth.discovery(
        issuer,
        clientId,
        clientMetadata,
        oauth.None(),
        requestOptions(),
      )
    : await oauth.dynamicClientRegistration(
        issuer,
        clientMetadata,
        oauth.None(),
        requestOptions(),
      );
  assertOAuthCapabilities(config);

  const registeredClientId = config.clientMetadata().client_id;
  if (!registeredClientId) {
    throw new Error('OAuth client registration returned no client_id.');
  }
  const nextState = {
    ...(clientId === state.clientId ? state : {}),
    clientId: registeredClientId,
    redirectUri: OAUTH_REDIRECT_URI.href,
    registrationScope: OAUTH_SCOPE,
  } satisfies StoredOAuthState;
  await writeOAuthState(issuer, nextState);
  return { config, state: nextState };
}

type OAuthTokens = Awaited<ReturnType<typeof oauth.refreshTokenGrant>>;

function stateWithTokens(
  state: StoredOAuthState,
  tokens: OAuthTokens,
  requireRefreshToken: boolean,
) {
  const expiresIn = tokens.expiresIn();
  if (!expiresIn || expiresIn <= 0) {
    throw new Error('The OAuth token response did not include expires_in.');
  }
  const refreshToken = tokens.refresh_token ?? state.refreshToken;
  if (requireRefreshToken && !refreshToken) {
    throw new Error(
      'The OAuth server did not issue a refresh token for offline_access.',
    );
  }
  if (tokens.scope && !tokens.scope.split(/\s+/u).includes('SEARCH')) {
    throw new Error('The OAuth grant does not include SEARCH scope.');
  }

  return {
    ...state,
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    grantedScope: tokens.scope ?? state.grantedScope ?? OAUTH_SCOPE,
  } satisfies StoredOAuthState;
}

/**
 * Registers a public OAuth client through DCR and completes Authorization Code
 * with PKCE. Registration and refresh tokens are stored outside the project.
 */
export async function loginWithOAuth(
  issuer: URL,
  authorize: (authorizationUrl: URL) => Promise<URL> = authorizeOnLoopback,
) {
  await withOAuthStateLock(issuer, async () => {
    const storedState = await readOAuthState(issuer);
    const { config, state } = await registerOrDiscoverClient(
      issuer,
      storedState,
    );
    const codeVerifier = oauth.randomPKCECodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
    const expectedState = oauth.randomState();
    const authorizationUrl = oauth.buildAuthorizationUrl(config, {
      redirect_uri: OAUTH_REDIRECT_URI.href,
      scope: OAUTH_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: expectedState,
    });

    const callbackUrl = await authorize(authorizationUrl);
    const tokens = await oauth.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });
    await writeOAuthState(issuer, stateWithTokens(state, tokens, true));
  });
}

async function freshAccessToken(issuer: URL) {
  return withOAuthStateLock(issuer, async () => {
    const state = await readOAuthState(issuer);
    if (
      state.accessToken &&
      state.expiresAt &&
      state.expiresAt > Date.now() + EXPIRY_SKEW_MS
    ) {
      return state.accessToken;
    }
    if (!state.refreshToken) {
      throw new Error('OAuth sign-in is required. Run npm run login.');
    }

    const config = await discoverRegisteredClient(issuer, state);
    const tokens = await oauth.refreshTokenGrant(config, state.refreshToken);
    const refreshedState = stateWithTokens(state, tokens, false);
    await writeOAuthState(issuer, refreshedState);
    return refreshedState.accessToken;
  });
}

/** Returns an SDK-compatible token callback with single-flight refresh. */
export function createOAuthTokenProvider(issuer: URL) {
  let pending: Promise<string> | undefined;
  return () => {
    pending ??= freshAccessToken(issuer).finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
