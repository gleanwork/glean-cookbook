import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  assertScopes,
  awaitRedirect,
  createPkce,
  discoverBackend,
  grantedScopes,
  persistTokens,
  run,
  storedToken,
  updateEnvFile,
} from './recipe-auth.mjs';

test('can be imported when Node has no script argument', () => {
  const moduleUrl = pathToFileURL(
    path.join(import.meta.dirname, 'recipe-auth.mjs'),
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(moduleUrl)})`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('discovers and normalizes a customer backend', async () => {
  const result = await discoverBackend(
    ' Person@Example.com ',
    async (url, init) => {
      assert.equal(url, 'https://app.glean.com/config/search');
      assert.deepEqual(JSON.parse(init.body), { email: 'person@example.com' });
      return { search_config: { queryURL: 'https://acme.askscio.com/search' } };
    },
  );
  assert.deepEqual(result, {
    instance: 'acme',
    backend: 'https://acme-be.glean.com',
  });
});

// Discovery returns the backend host directly for most tenants, and the legacy
// frontend host for others. Both must land on the same backend.
test('discovers a backend from either discovery host form', async () => {
  const discover = (queryURL) =>
    discoverBackend('person@example.com', async () => ({
      search_config: { queryURL },
    }));
  for (const queryURL of [
    'https://acme-be.glean.com/',
    'https://acme.askscio.com/search',
    'https://acme.glean.com/search',
  ]) {
    assert.deepEqual(await discover(queryURL), {
      instance: 'acme',
      backend: 'https://acme-be.glean.com',
    });
  }
  assert.deepEqual(await discover('https://my-corp-be.glean.com/'), {
    instance: 'my-corp',
    backend: 'https://my-corp-be.glean.com',
  });
});

test('rejects generic and untrusted discovery responses', async () => {
  await assert.rejects(
    discoverBackend('person@example.com', async () => ({
      search_config: { queryURL: 'https://app.askscio.com/search' },
    })),
    /No customer Glean tenant/u,
  );
  await assert.rejects(
    discoverBackend('person@example.com', async () => ({
      search_config: { queryURL: 'https://attacker.example/search' },
    })),
    /No customer Glean tenant/u,
  );
});

test('updates an env file without deleting customer configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-auth-'));
  const file = path.join(directory, '.env');
  fs.writeFileSync(
    file,
    '# customer setting\nGLEAN_API_TOKEN=old\nCUSTOM=value\n',
  );
  updateEnvFile(file, {
    GLEAN_API_TOKEN: 'new',
    GLEAN_SERVER_URL: 'https://acme-be.glean.com',
  });
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    '# customer setting\nGLEAN_API_TOKEN=new\nCUSTOM=value\nGLEAN_SERVER_URL=https://acme-be.glean.com\n',
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('creates an RFC 7636 S256 PKCE pair', () => {
  const { verifier, challenge } = createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/u);
});

test('configures a Web SDK env file without starting OAuth', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-auth-'));
  fs.writeFileSync(
    path.join(directory, '.env.example'),
    'VITE_GLEAN_BACKEND=\nCHECKLIST_FILE=./steps.example.json\n',
  );
  await run(
    [
      'configure',
      '--backend',
      'https://acme-be.glean.com',
      '--config-file',
      '.env.local',
      '--backend-variable',
      'VITE_GLEAN_BACKEND',
    ],
    directory,
  );
  assert.match(
    fs.readFileSync(path.join(directory, '.env.local'), 'utf8'),
    /VITE_GLEAN_BACKEND=https:\/\/acme-be\.glean\.com/u,
  );
  assert.match(
    fs.readFileSync(path.join(directory, '.env.local'), 'utf8'),
    /CHECKLIST_FILE=\.\/steps\.example\.json/u,
  );
  assert.equal(
    fs.statSync(path.join(directory, '.env.local')).mode & 0o777,
    0o600,
  );
});

test('refreshes an expired cached OAuth token', async () => {
  const stateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'recipe-auth-state-'),
  );
  const previousStateRoot = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = stateRoot;
  const backend = 'https://acme-be.glean.com';
  const stateDirectory = path.join(stateRoot, 'glean-cookbook');
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(stateDirectory, 'acme-be.glean.com.json'),
    JSON.stringify({
      client_id: 'client-id',
      refresh_token: 'refresh-token',
      expires_at: 0,
      scope: 'search offline_access',
    }),
  );
  const server = http.createServer((request, response) => {
    assert.equal(request.method, 'POST');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ access_token: 'fresh-token', expires_in: 3600 }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    assert.equal(
      await storedToken(
        backend,
        { token_endpoint: `http://127.0.0.1:${port}/token` },
        ['search'],
      ),
      'fresh-token',
    );
  } finally {
    server.close();
    if (previousStateRoot === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateRoot;
  }
});

test('does not reuse a cached token missing the recipe scopes', async () => {
  const stateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'recipe-auth-state-'),
  );
  const previousStateRoot = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = stateRoot;
  const stateDirectory = path.join(stateRoot, 'glean-cookbook');
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(stateDirectory, 'acme-be.glean.com.json'),
    JSON.stringify({
      access_token: 'chat-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      scope: 'chat offline_access',
    }),
  );
  try {
    assert.equal(
      await storedToken(
        'https://acme-be.glean.com',
        { token_endpoint: 'https://unused.example/token' },
        ['agents'],
      ),
      undefined,
    );
  } finally {
    if (previousStateRoot === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateRoot;
  }
});

test('rejects an OAuth callback with the wrong state', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const redirect = awaitRedirect(server, 'expected-state', 2_000);
  const rejected = assert.rejects(redirect, /state mismatch/iu);
  await fetch(`http://127.0.0.1:${port}/callback?code=code&state=wrong-state`);
  await rejected;
  server.close();
});

// A narrowed grant must fail the login, not surface as a 403 later.
test('a grant missing a required scope fails the login', () => {
  assert.throws(
    () => assertScopes({ scope: 'offline_access' }, ['triggers']),
    /missing triggers/u,
  );
});

test('a grant carrying the required scope passes', () => {
  assert.doesNotThrow(() =>
    assertScopes({ scope: 'offline_access TRIGGERS' }, ['triggers']),
  );
});

// RFC 6749 §5.1 makes the response `scope` optional when it matches the
// request, so a conforming server that echoes nothing must not be failed.
test('a response with no scope is treated as granted-as-requested', () => {
  assert.doesNotThrow(() => assertScopes({ access_token: 'x' }, ['triggers']));
  assert.equal(grantedScopes({ access_token: 'x' }), undefined);
});

// A refresh omits `scope` and supplies none, so the stored value must survive.
test('a refresh with no scope in the response keeps the stored scope', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-'));
  process.env.XDG_STATE_HOME = stateDir;
  const backend = 'https://keep-scope.example.com';
  updateEnvFile(path.join(stateDir, '.env'), {});
  persistTokens(backend, { access_token: 'a', scope: 'triggers' }, [
    'triggers',
  ]);
  persistTokens(backend, { access_token: 'b' });
  const file = path.join(
    stateDir,
    'glean-cookbook',
    'keep-scope.example.com.json',
  );
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).scope, 'triggers');
});
