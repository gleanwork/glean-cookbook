import http from 'node:http';
import assert from 'node:assert/strict';
import { onTestFinished, test } from 'vitest';
import { limitKey } from '../lib/contracts.mjs';
import { createServer, parseCliArgs } from '../server.mjs';
import { demo, draft } from './fixtures.mjs';

test('Loopback server blocks cross-origin writes and DNS rebinding, serves CSP, and never exposes credentials', async () => {
  const server = createServer({ provider: demo() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.ok(
    home.headers
      .get('content-security-policy')
      .includes("frame-ancestors 'none'"),
  );
  const send = (headers = {}) =>
    fetch(`${origin}/api/limits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Recipe-Request': '1',
        ...headers,
      },
      body: JSON.stringify(draft()),
    });
  assert.equal((await send({ Origin: 'https://evil.test' })).status, 403);
  // fetch owns Host; use the HTTP client to exercise an actual rebinding request.
  const rebound = await new Promise((resolve, reject) => {
    const request = http.get(
      `${origin}/api/capabilities`,
      { headers: { Host: 'evil.test' } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    request.on('error', reject);
  });
  assert.equal(rebound, 403);
  assert.equal((await send({ 'X-Recipe-Request': '' })).status, 403);
  assert.equal((await send()).status, 200);
  const reset = await fetch(`${origin}/api/limits/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Recipe-Request': '1' },
    body: JSON.stringify(limitKey(draft())),
  });
  assert.equal((await reset.json()).is_configuration_removed, true);
  const caps = await (await fetch(`${origin}/api/capabilities`)).json();
  assert.equal(caps.mode, 'demo');
  assert.ok(!JSON.stringify(caps).includes('token'));
  const tooBig = await fetch(`${origin}/api/limits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Recipe-Request': '1' },
    body: JSON.stringify({ x: 'x'.repeat(70000) }),
  });
  assert.equal(tooBig.status, 413);
});
test('The CLI selects live mode only; credentials never come from flags', () => {
  assert.deepEqual(parseCliArgs([]), { live: false });
  assert.deepEqual(parseCliArgs(['--live']), { live: true });
  assert.throws(() => parseCliArgs(['--token', 'secret']));
  assert.throws(() => parseCliArgs(['--server-url', 'https://example.test']));
});
