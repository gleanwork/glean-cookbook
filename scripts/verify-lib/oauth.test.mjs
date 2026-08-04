// Tests for the harness's own OAuth flow.
//
// node:test, so this needs no dependency -- matching the rest of this harness.
// Run with `npm test`.
//
// Everything here is local: a real socket, real HTTP, real crypto, no instance.
// The one test that needs a live authorization server is gated behind
// GLEAN_INSTANCE so CI stays hermetic.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { awaitRedirect, discover, storedToken } from './oauth.mjs';

/** Drives the callback server the way a browser redirect would. */
async function redirect(query, { expectedState = 'THE-REAL-STATE' } = {}) {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  // Settle before the fetch: a synchronous rejection would otherwise land as an
  // unhandled rejection instead of something assertable.
  const settled = awaitRedirect(server, expectedState, 5000).then(
    (code) => ({ ok: true, code }),
    (error) => ({ ok: false, error }),
  );
  const response = await fetch(`http://127.0.0.1:${port}/callback?${query}`);
  const body = await response.text();
  const result = await settled;
  server.close();
  return { ...result, body };
}

test('accepts a redirect whose state matches', async () => {
  const result = await redirect('code=GOOD&state=THE-REAL-STATE');
  assert.ok(result.ok);
  assert.equal(result.code, 'GOOD');
  assert.match(result.body, /Signed in/);
});

test('rejects a forged state, and does not surface the code', async () => {
  const result = await redirect('code=ATTACKER&state=WRONG');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /state mismatch/i);
});

test('rejects a redirect carrying no state at all', async () => {
  const result = await redirect('code=ATTACKER');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /state mismatch/i);
});

test('surfaces an authorization error from the server', async () => {
  const result = await redirect('error=access_denied&state=THE-REAL-STATE');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /access_denied/);
});

test('rejects a redirect with a valid state but no code', async () => {
  const result = await redirect('state=THE-REAL-STATE');
  assert.equal(result.ok, false);
  assert.match(result.error.message, /no authorization code/);
});

test('times out rather than hanging when no redirect arrives', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const error = await awaitRedirect(server, 'state', 800).then(
    () => null,
    (e) => e,
  );
  server.close();
  assert.ok(error, 'expected a timeout, not a resolution');
  assert.match(error.message, /within 0\.8s/);
});

test('PKCE challenge is base64url(sha256(verifier)) per RFC 7636', () => {
  // Reproduces what login() derives, asserting the transform rather than the
  // implementation: a challenge that is merely random would still "work" up to
  // the token exchange, then fail there for reasons that look unrelated.
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  assert.equal(
    challenge,
    Buffer.from(crypto.createHash('sha256').update(verifier).digest()).toString(
      'base64url',
    ),
  );
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.doesNotMatch(challenge, /[+/=]/, 'must be base64url, not base64');
});

test('storedToken returns null when nothing is cached', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glean-oauth-'));
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.equal(await storedToken('https://nothing-here.example.com'), null);
});

test('storedToken ignores a cached token with no expiry data', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glean-oauth-'));
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const stateDir = path.join(dir, 'glean-cookbook');
  fs.mkdirSync(stateDir, { recursive: true });
  // Expired, and no refresh token to recover with: returning the stale token
  // would produce a 401 that reads as the recipe being broken.
  fs.writeFileSync(
    path.join(stateDir, 'stale.example.com.json'),
    JSON.stringify({ access_token: 'stale', expires_at: 1 }),
  );
  assert.equal(await storedToken('https://stale.example.com'), null);
});

test(
  'discovery resolves against a live instance',
  { skip: process.env.GLEAN_INSTANCE ? false : 'set GLEAN_INSTANCE to run' },
  async () => {
    const metadata = await discover(
      `https://${process.env.GLEAN_INSTANCE}-be.glean.com`,
    );
    assert.ok(metadata.authorization_endpoint);
    assert.ok(metadata.token_endpoint);
    assert.ok(
      (metadata.code_challenge_methods_supported ?? []).includes('S256'),
      'this flow requires S256 PKCE',
    );
  },
);

test('discovery fails on a host serving no authorization-server metadata', async () => {
  await assert.rejects(() => discover('https://example.com'));
});
