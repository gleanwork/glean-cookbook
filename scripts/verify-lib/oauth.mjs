// Authorization-code + PKCE against a Glean instance, for the verify harness.
//
// Deliberately isolated rather than reusing @gleanwork/mcp-server-tester's
// flow, which is the other first-party implementation of this. Two reasons:
// that package weighs ~350MB (its eval/judge feature bundles the Anthropic SDK
// and Playwright), and its `login` command renders an Ink UI needing raw-mode
// stdin, so it can't run headlessly. Its flow is exported as CLIOAuthClient and
// would be usable directly -- but only as a real dependency, since npx won't
// expose a package to an external script's module resolution.
//
// This harness has no runtime dependencies and shells out to uv and tiged, so
// it stays that way: node: builtins only. The tradeoff is a third
// implementation of this flow at Glean, after configure-mcp-server and
// mcp-server-tester. If a small shared auth helper is ever extracted, delete
// this in favour of it.
//
// Scope is narrow on purpose: one authorization server (the instance backend),
// one grant, no MCP protocol concerns.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// Glean's authorization server derives client_id from this: spaces become
// underscores and the result is truncated to 16 characters, then suffixed with a
// uuid. That's why a Claude Code login appears as Claude_Code_<uuid>, and why
// this name is deliberately short -- "Glean Cookbook Recipe Verification"
// registers as the unhelpful Glean_Cookbook_R_<uuid>, verified against a real
// registration. Keep any replacement at or under 16 characters so the client
// stays identifiable in the admin console's OAuth client list.
//
// client_name is the only lever: client_uri and software_id are accepted and
// then dropped, so there's nowhere else to record provenance.
const CLIENT_NAME = 'Glean Cookbook';

/** Where tokens live. Never inside the repo -- these are real credentials. */
function stateFile(backend) {
  const base =
    process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'glean-cookbook', `${new URL(backend).host}.json`);
}

function readState(backend) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(backend), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(backend, state) {
  const file = stateFile(backend);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 0600: this file holds a refresh token, a long-lived credential.
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
}

async function json(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${init?.method ?? 'GET'} ${url} -> ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  return JSON.parse(text);
}

export async function discover(backend) {
  const metadata = await json(
    `${backend}/.well-known/oauth-authorization-server`,
  );
  for (const field of ['authorization_endpoint', 'token_endpoint']) {
    if (!metadata[field]) {
      throw new Error(
        `${backend} advertises no ${field}; OAuth is not usable here`,
      );
    }
  }
  return metadata;
}

/**
 * Registers a public client via RFC 7591 Dynamic Client Registration.
 *
 * This is the only thing here that writes to the instance -- an OAuth client
 * record, not content. Cached locally so it happens once per instance rather
 * than once per run. GLEAN_OAUTH_CLIENT_ID skips it entirely.
 */
async function clientId(backend, metadata, redirectUri) {
  if (process.env.GLEAN_OAUTH_CLIENT_ID) {
    return process.env.GLEAN_OAUTH_CLIENT_ID;
  }
  const state = readState(backend);
  if (state.client_id && state.redirect_uri === redirectUri) {
    return state.client_id;
  }
  if (!metadata.registration_endpoint) {
    throw new Error(
      `${backend} supports no dynamic client registration. Register a client ` +
        `manually and set GLEAN_OAUTH_CLIENT_ID, or use GLEAN_API_TOKEN.`,
    );
  }

  const registration = await json(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  writeState(backend, {
    ...state,
    client_id: registration.client_id,
    redirect_uri: redirectUri,
  });
  return registration.client_id;
}

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

/**
 * Serves exactly one request: the redirect carrying ?code and ?state.
 *
 * Exported for oauth.test.mjs. State validation is the part of this flow that
 * must not be taken on trust, so it's tested directly against a real socket.
 */
export function awaitRedirect(server, expectedState, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no OAuth redirect within ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    server.on('request', (request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      const done = (message) => {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end(message);
        clearTimeout(timer);
      };

      if (error) {
        done(`Authorization failed: ${error}. You can close this tab.`);
        return reject(new Error(`authorization failed: ${error}`));
      }
      // Comparing state is what makes this resistant to a forged redirect;
      // skipping it would accept a code we never asked for.
      if (returnedState !== expectedState) {
        done('State mismatch. You can close this tab.');
        return reject(new Error('OAuth state mismatch - discarding response'));
      }
      if (!code) {
        done('No authorization code in the redirect. You can close this tab.');
        return reject(new Error('redirect carried no authorization code'));
      }
      done('Signed in. You can close this tab and return to the terminal.');
      resolve(code);
    });
  });
}

function openBrowser(url) {
  const [bin, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  execFile(bin, args, () => {});
}

async function exchange(metadata, body) {
  return json(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

function persist(backend, tokens) {
  const state = readState(backend);
  writeState(backend, {
    ...state,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? state.refresh_token,
    // A minute early, so a token can't lapse mid-run.
    expires_at:
      Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600) - 60,
    scope: tokens.scope ?? state.scope,
  });
  return tokens.access_token;
}

/** The interactive flow: opens a browser, waits for the redirect. */
export async function login(backend, scopes, { timeoutMs = 300_000 } = {}) {
  const metadata = await discover(backend);

  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;

  try {
    const id = await clientId(backend, metadata, redirectUri);
    const { verifier, challenge } = pkce();
    const state = crypto.randomBytes(16).toString('base64url');

    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: id,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    console.log(`Opening a browser to sign in to ${new URL(backend).host}...`);
    console.log(`If it doesn't open, visit:\n  ${authorizeUrl}\n`);
    openBrowser(authorizeUrl.toString());

    const code = await awaitRedirect(server, state, timeoutMs);
    const tokens = await exchange(metadata, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: id,
      code_verifier: verifier,
    });

    // The server may narrow what it grants. Saying so now beats a later 403
    // that reads as the recipe's fault.
    const granted = (tokens.scope ?? '').split(' ').filter(Boolean);
    const withheld = scopes.filter(
      (s) => granted.length > 0 && !granted.includes(s),
    );
    if (withheld.length > 0) {
      console.warn(
        `warning: requested but not granted: ${withheld.join(', ')}`,
      );
    }
    return persist(backend, tokens);
  } finally {
    server.close();
  }
}

/**
 * A valid access token from local state, refreshing if expired. Returns null
 * rather than starting an interactive flow, so callers decide whether opening a
 * browser is acceptable.
 */
export async function storedToken(backend) {
  const state = readState(backend);
  if (!state.access_token) return null;
  if (state.expires_at && state.expires_at > Math.floor(Date.now() / 1000)) {
    return state.access_token;
  }
  if (!state.refresh_token || !state.client_id) return null;

  try {
    const metadata = await discover(backend);
    return persist(
      backend,
      await exchange(metadata, {
        grant_type: 'refresh_token',
        refresh_token: state.refresh_token,
        client_id: state.client_id,
      }),
    );
  } catch {
    // An expired or revoked refresh token means a fresh login, not a crash.
    return null;
  }
}
