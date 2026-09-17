import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendOrigin, createAgentRuns } from '../src/agent-runs.js';
import { agentId, runId, snapshot } from './fixtures.js';

test('four calls use the public contract and never enable experimental behavior', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = createAgentRuns({
    serverUrl: 'https://example-be.glean.com',
    agentId,
    token: async () => 'test-token',
    fetch: (async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(snapshot(), {
        status: calls.length === 1 ? 201 : 200,
      });
    }) as typeof fetch,
  });
  assert.equal(
    (await client.create('Post to my authorized test channel.')).status,
    201,
  );
  await client.get(runId);
  await client.respond(runId, {
    responses: [{ interaction_id: 'approval_1', decision: 'APPROVE' }],
  });
  await client.cancel(runId);
  assert.deepEqual(
    calls.map((call) => new URL(call.url).pathname),
    [
      `/api/agents/${agentId}/runs`,
      `/api/agents/${agentId}/runs/${runId}`,
      `/api/agents/${agentId}/runs/${runId}/responses`,
      `/api/agents/${agentId}/runs/${runId}/cancellations`,
    ],
  );
  assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), {
    execution_mode: 'DURABLE',
    stream: false,
    messages: [
      {
        role: 'USER',
        content: [
          { type: 'text', text: 'Post to my authorized test channel.' },
        ],
      },
    ],
  });
  assert.equal(calls[3]!.init!.body, undefined);
  for (const call of calls) {
    assert.equal(call.init!.redirect, 'error');
    assert.deepEqual(call.init!.headers, {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }
});
test('HTTP conflicts, failures, and rate limits remain HTTP results', async () => {
  for (const status of [401, 403, 404, 409, 422, 429, 500]) {
    let count = 0;
    const client = createAgentRuns({
      serverUrl: 'https://example.com',
      agentId,
      token: async () => 'secret-token',
      fetch: (async () => {
        count++;
        return Response.json(
          { detail: 'secret-token' },
          { status, headers: { 'Retry-After': '9' } },
        );
      }) as typeof fetch,
    });
    const result = await client.create('test');
    assert.equal(count, 1);
    assert.equal(result.status, status);
    assert.equal(result.retryAfterSeconds, 9);
    assert.deepEqual(result.body, { detail: '[REDACTED]' });
  }
});
test('an ambiguous network failure never retries a creation POST', async () => {
  let count = 0;
  const client = createAgentRuns({
    serverUrl: 'https://example.com',
    agentId,
    token: async () => 'test-token',
    fetch: (async () => {
      count++;
      throw new Error('socket closed');
    }) as typeof fetch,
  });
  await assert.rejects(client.create('test'));
  assert.equal(count, 1);
});
test('backend URL and IDs cannot redirect credentials or route requests elsewhere', () => {
  for (const url of [
    'http://example.com',
    'https://u:p@example.com',
    'https://example.com/api',
    'https://example.com/?a=b',
  ]) {
    assert.throws(() => backendOrigin(url));
  }
  assert.throws(() =>
    createAgentRuns({ serverUrl: 'https://example.com', agentId: '..' }),
  );
});
