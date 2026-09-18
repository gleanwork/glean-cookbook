import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { request as nodeRequest } from 'node:http';
import { createExplorerServer } from '../src/explorer.js';
import type { AgentRuns } from '../src/agent-runs.js';
import { agentId, snapshot } from './fixtures.js';
let calls = 0;
const exchange = async () => {
  calls++;
  return {
    method: 'GET',
    path: '/api/agents/a/runs/r',
    status: 200,
    body: snapshot(),
  };
};
const client: AgentRuns = {
  create: exchange,
  get: exchange,
  respond: exchange,
  cancel: exchange,
};
const server = createExplorerServer(client, agentId);
let base = '';
before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});
after(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
);
const headers = {
  'X-Cookbook-Request': '1',
  'Content-Type': 'application/json',
};
test('no API proxy without the same-origin custom header', async () => {
  const before = calls;
  for (const extra of [
    {},
    { ...headers, Origin: 'https://attacker.example' },
    { ...headers, 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: extra,
      body: '{"message":"test"}',
    });
    assert.equal(response.status, 403, JSON.stringify(extra));
  }
  // Node fetch replaces Host; use node:http to exercise an actual hostile Host header.
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = nodeRequest(
      `${base}/api/runs`,
      { method: 'POST', headers: { ...headers, Host: 'attacker.example' } },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end('{"message":"test"}');
  });
  assert.equal(status, 403);
  assert.equal(calls, before);
});
test('only agent ID is exposed in browser configuration', async () => {
  const response = await fetch(`${base}/api/config`, { headers });
  assert.deepEqual(await response.json(), { agentId });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('reject malformed, oversized, duplicate, and edited decisions before a Glean call', async () => {
  const before = calls;
  const bodies = [
    'not json',
    JSON.stringify({ responses: [] }),
    JSON.stringify({
      responses: [{ interaction_id: 'i', decision: 'APPROVE', arguments: {} }],
    }),
    ' '.repeat(70_000),
  ];
  for (const body of bodies) {
    const response = await fetch(`${base}/api/runs/run_fixture/responses`, {
      method: 'POST',
      headers,
      body,
    });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, before);
});
test('bounded same-origin call reaches only the configured client', async () => {
  const response = await fetch(`${base}/api/runs/run_fixture`, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).body.run.state, 'REQUIRES_INPUT');
});
test('static server blocks path traversal and does not expose .env or source', async () => {
  for (const route of [
    '/.env',
    '/server.ts',
    '/src/agent-runs.ts',
    '/%2e%2e/.env',
  ]) {
    const response = await fetch(`${base}${route}`, { headers });
    assert.equal(response.status, 404);
  }
  const response = await fetch(base);
  assert.ok(
    response.headers
      .get('content-security-policy')
      ?.includes("script-src 'self'"),
  );
});
