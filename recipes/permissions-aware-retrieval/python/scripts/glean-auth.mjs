#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DISCOVERY_URL = 'https://app.glean.com/config/search';
const CLIENT_NAME = 'Glean Cookbook';
const CALLBACK_PORT = 53682;

function fail(message) {
  throw new Error(message);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    fail(
      `${init?.method ?? 'GET'} ${url} -> ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${url} returned invalid JSON`);
  }
}

export async function discoverBackend(email, request = requestJson) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    fail('Enter a valid work email address.');
  }

  const config = await request(DISCOVERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized }),
  });
  const queryURL = config?.search_config?.queryURL;
  if (typeof queryURL !== 'string') {
    fail('Glean tenant discovery returned no search_config.queryURL.');
  }

  let hostname;
  try {
    hostname = new URL(queryURL).hostname.toLowerCase();
  } catch {
    fail('Glean tenant discovery returned an invalid queryURL.');
  }
  // Discovery returns either the backend host already (`acme-be.glean.com`) or
  // the legacy frontend one (`acme.askscio.com`). Appending `-be` to the first
  // would ask for `acme-be-be.glean.com`, which does not resolve.
  const match = hostname.match(
    /^([a-z0-9-]+?)(-be)?\.(?:glean\.com|askscio\.com)$/u,
  );
  if (!match || match[1] === 'app') {
    fail(
      `No customer Glean tenant was found for ${normalized}. Check the email and try again.`,
    );
  }

  const instance = match[1];
  return { instance, backend: `https://${instance}-be.glean.com` };
}

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
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(file, 0o600);
}

export function updateEnvFile(file, values) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pending = new Map(Object.entries(values));
  const lines = existing.split('\n').map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  while (lines.at(-1) === '') lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** Keys the env file declares but leaves empty, in file order. */
export function blankEnvKeys(contents) {
  return contents
    .split('\n')
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=[ \t]*$/u)?.[1])
    .filter((key) => key !== undefined);
}

export function createPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export async function discoverOAuth(backend, request = requestJson) {
  const metadata = await request(
    `${backend}/.well-known/oauth-authorization-server`,
  );
  for (const field of ['authorization_endpoint', 'token_endpoint']) {
    if (!metadata[field]) fail(`${backend} does not advertise ${field}.`);
  }
  return metadata;
}

async function registerClient(backend, metadata, redirectUri) {
  if (process.env.GLEAN_OAUTH_CLIENT_ID)
    return process.env.GLEAN_OAUTH_CLIENT_ID;
  const state = readState(backend);
  if (state.client_id && state.redirect_uri === redirectUri)
    return state.client_id;
  if (!metadata.registration_endpoint) {
    fail(
      'This tenant does not support dynamic client registration. Use a scoped Glean API token instead.',
    );
  }
  const registration = await requestJson(metadata.registration_endpoint, {
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
  if (!registration.client_id)
    fail('OAuth client registration returned no client_id.');
  writeState(backend, {
    ...state,
    client_id: registration.client_id,
    redirect_uri: redirectUri,
  });
  return registration.client_id;
}

export function awaitRedirect(server, expectedState, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for Glean sign-in.')),
      timeoutMs,
    );
    server.once('request', (request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const finish = (message) => {
        clearTimeout(timer);
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end(message);
      };
      if (error) {
        finish(`Authorization failed: ${error}. You can close this tab.`);
        reject(new Error(`Authorization failed: ${error}`));
      } else if (returnedState !== expectedState) {
        finish('State mismatch. You can close this tab.');
        reject(new Error('OAuth state mismatch.'));
      } else if (!code) {
        finish('No authorization code was returned. You can close this tab.');
        reject(new Error('OAuth redirect contained no authorization code.'));
      } else {
        finish('Signed in. You can close this tab and return to the terminal.');
        resolve(code);
      }
    });
  });
}

function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  execFile(command, args, () => {});
}

async function exchange(metadata, body) {
  return requestJson(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

export function persistTokens(backend, tokens, requestedScopes = []) {
  const state = readState(backend);
  const expiresAt =
    Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600) - 60;
  writeState(backend, {
    ...state,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? state.refresh_token,
    expires_at: expiresAt,
    // An absent `scope` means "as requested" (RFC 6749 §5.1). A refresh passes
    // no scopes, so fall through to the stored one rather than blanking it.
    scope: tokens.scope ?? (requestedScopes.join(' ') || state.scope),
  });
  return tokens.access_token;
}

/** The scopes a grant actually carries, or undefined when the server said nothing. */
export function grantedScopes(tokens) {
  if (tokens.scope === undefined || tokens.scope === null) return undefined;
  return new Set(
    String(tokens.scope).toLowerCase().split(/\s+/u).filter(Boolean),
  );
}

/**
 * Fails a login whose grant explicitly omits a required scope, so a narrowed
 * grant surfaces here rather than as a 403 on the first API call. An absent
 * `scope` means granted-as-requested (RFC 6749 §5.1), so it is not a failure.
 */
export function assertScopes(tokens, requiredScopes = []) {
  if (requiredScopes.length === 0) return;
  const granted = grantedScopes(tokens);
  if (granted === undefined) return;
  const missing = requiredScopes.filter(
    (scope) => !granted.has(scope.toLowerCase()),
  );
  if (missing.length === 0) return;
  throw new Error(
    `Sign-in succeeded but the grant is missing ${missing.join(', ')}. ` +
      `It carries: ${[...granted].join(', ') || '(nothing)'}. ` +
      `This tenant's OAuth client cannot issue the scope this recipe needs, so ` +
      `every call would fail with 403. Use a scoped Glean API token in .env as ` +
      `GLEAN_API_TOKEN, or ask an admin for a pre-provisioned OAuth client.`,
  );
}

function coversScopes(state, requiredScopes) {
  if (requiredScopes.length === 0) return true;
  const granted = new Set(
    String(state.scope ?? '')
      .toLowerCase()
      .split(/\s+/u)
      .filter(Boolean),
  );
  return requiredScopes.every((scope) => granted.has(scope.toLowerCase()));
}

export async function storedToken(backend, metadata, requiredScopes = []) {
  const state = readState(backend);
  if (!coversScopes(state, requiredScopes)) return undefined;
  if (state.access_token && state.expires_at > Math.floor(Date.now() / 1000)) {
    return state.access_token;
  }
  if (!state.refresh_token || !state.client_id) return undefined;
  const tokens = await exchange(metadata, {
    grant_type: 'refresh_token',
    refresh_token: state.refresh_token,
    client_id: state.client_id,
  });
  return persistTokens(backend, tokens);
}

async function interactiveLogin(backend, metadata, scopes) {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1', resolve);
  });
  const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
  try {
    const clientId = await registerClient(backend, metadata, redirectUri);
    const { verifier, challenge } = createPkce();
    const state = crypto.randomBytes(16).toString('base64url');
    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: [...new Set([...scopes, 'offline_access'])].join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    console.log(
      scopes.length > 0
        ? `Opening your browser to sign in to ${new URL(backend).host} and approve ${scopes.join(', ')}...`
        : `Opening your browser to sign in to ${new URL(backend).host}...`,
    );
    console.log(`If it does not open, visit:\n${authorizeUrl}\n`);
    openBrowser(authorizeUrl.toString());
    const code = await awaitRedirect(server, state);
    const tokens = await exchange(metadata, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
    assertScopes(tokens, scopes);
    return persistTokens(backend, tokens, scopes);
  } finally {
    server.close();
  }
}

function parseArgs(argv) {
  const result = {
    command: argv[0] ?? 'login',
    scopes: [],
    required: [],
    envFile: '.env',
    backendVariable: 'GLEAN_SERVER_URL',
  };
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--email') result.email = argv[++index];
    else if (argv[index] === '--backend') result.backend = argv[++index];
    else if (argv[index] === '--scopes')
      result.scopes = argv[++index].split(',').filter(Boolean);
    else if (argv[index] === '--require')
      result.required = argv[++index].split(',').filter(Boolean);
    else if (argv[index] === '--config-file') result.envFile = argv[++index];
    else if (argv[index] === '--backend-variable')
      result.backendVariable = argv[++index];
    else fail(`Unknown argument: ${argv[index]}`);
  }
  return result;
}

async function askEmail() {
  if (!process.stdin.isTTY) fail('Pass your work email with --email.');
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question('Work email: ');
  } finally {
    terminal.close();
  }
}

export async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (!['configure', 'login', 'status', 'clear'].includes(args.command)) {
    fail('Usage: glean-auth.mjs <configure|login|status|clear> [options]');
  }

  const envPath = path.join(cwd, args.envFile);
  const exampleEnvPath = path.join(cwd, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(exampleEnvPath)) {
    fs.copyFileSync(exampleEnvPath, envPath);
    fs.chmodSync(envPath, 0o600);
  }
  const currentEnv = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8')
    : '';
  const escapedBackendVariable = args.backendVariable.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
  const configuredBackend = currentEnv
    .match(new RegExp(`^${escapedBackendVariable}=(.+)$`, 'mu'))?.[1]
    ?.trim();
  let backend = args.backend ?? configuredBackend;
  let instance;
  if (!backend) {
    const discovered = await discoverBackend(args.email ?? (await askEmail()));
    backend = discovered.backend;
    instance = discovered.instance;
  } else {
    const url = new URL(backend);
    if (url.protocol !== 'https:') fail('Glean backend URL must use HTTPS.');
    const match = url.hostname.match(/^([a-z0-9-]+)-be\.glean\.com$/u);
    if (!match)
      fail('Glean backend must match https://<instance>-be.glean.com.');
    instance = match[1];
    backend = `https://${url.hostname}`;
  }

  if (args.command === 'clear') {
    fs.rmSync(stateFile(backend), { force: true });
    console.log(`Removed cached OAuth state for ${new URL(backend).host}.`);
    return;
  }

  updateEnvFile(envPath, {
    [args.backendVariable]: backend,
    GLEAN_INSTANCE: instance,
  });
  if (args.command === 'configure') {
    console.log(`Configured ${envPath} for ${new URL(backend).host}.`);
    return;
  }
  const metadata = await discoverOAuth(backend);
  if (args.command === 'status') {
    const state = readState(backend);
    console.log(
      state.refresh_token
        ? `OAuth is configured for ${new URL(backend).host}.`
        : 'OAuth is not configured.',
    );
    return;
  }

  const accessToken =
    (await storedToken(backend, metadata, args.scopes)) ??
    (await interactiveLogin(backend, metadata, args.scopes));
  updateEnvFile(envPath, { GLEAN_API_TOKEN: accessToken });
  console.log(
    `Signed in. Wrote ${args.backendVariable} and GLEAN_API_TOKEN to ${envPath}.`,
  );
  // Only the keys the recipe declares required: several scaffolds ship blanks
  // that are meant to stay blank, so reporting every empty key would send
  // customers off to fill in settings they do not need.
  const blank = new Set(blankEnvKeys(fs.readFileSync(envPath, 'utf8')));
  const missing = args.required.filter((key) => blank.has(key));
  console.log(
    missing.length === 0
      ? 'You are ready to verify and run the recipe.'
      : `Signing in cannot fill these in for you. Open ${args.envFile}, set ${missing.join(' and ')}, then verify and run the recipe.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error(`Sign-in failed: ${error.message}`);
    console.error(
      'If your tenant cannot use OAuth, you can skip this command: copy .env.example to .env, then fill in the Glean server URL and a Glean API token scoped for this recipe.',
    );
    process.exitCode = 1;
  });
}
