import { test } from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {
  ApiError,
  PERIOD,
  limitKey,
  makeLimit,
  parseEvaluation,
  validateEvaluation,
  validateLimit,
  validateSearch,
  parseSearchResponse,
  micros,
  decimal,
  buildOrgTree,
} from '../lib/contracts.mjs';
import { createDemoProvider, USERS } from '../lib/demo.mjs';
import { createLiveProvider, validateOrigin } from '../lib/live.mjs';
import { createServer } from '../server.mjs';

const query = {
  target: { type: 'ORGANIZATION' },
  time_range: { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' },
  granularity: 'DAY',
  page_size: 2,
};
const draft = (options) =>
  makeLimit({
    type: 'USER',
    userId: 'demo-sam',
    clientId: 'glean',
    amount: '600.000001',
    unit: 'CREDITS',
    ...options,
  });
const evaluation = (target) => ({
  target: { client_id: 'glean', ...target },
  period: PERIOD,
});
const sam = evaluation({ type: 'USER', user_id: 'demo-sam' });
const demo = () =>
  createDemoProvider({ now: () => new Date('2026-10-12T12:00:00Z') });
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('Limit bodies use supported natural keys, allocations, and exact opaque IDs', () => {
  assert.equal(
    draft({ clientId: ' padded-ID ' }).target.client_id,
    ' padded-ID ',
  );
  assert.equal(draft({ type: 'ORGANIZATION' }).allocation_mode, 'SHARED_POOL');
  assert.equal(draft({ type: 'DEFAULT_USER' }).allocation_mode, 'PER_MEMBER');
  assert.ok(!('allocation_mode' in draft()));
  assert.deepEqual(draft({ unlimited: true }).value, { mode: 'UNLIMITED' });
  assert.deepEqual(draft().period, PERIOD);
  assert.ok(!('actions' in draft()));
});
for (const options of [
  { type: 'DEPARTMENT' },
  { type: 'IDP_GROUP' },
  { type: 'AGENT' },
  { amount: '-1' },
  { amount: '1e2' },
  { amount: '1.0000001' },
  { amount: 2 },
  { amount: '01' },
  { amount: '9'.repeat(25) },
  { clientId: '  ' },
  { clientId: '\u00a0' },
  { clientId: '__deleted_clients__' },
  { clientId: '*' },
  { clientId: 'a\nb' },
]) {
  test(`Unsupported limit input is rejected: ${JSON.stringify(options)}`, () =>
    assert.throws(() => draft(options), ApiError));
}
test('Limit payload rejects extra fields and unlimited values', () => {
  assert.throws(() => validateLimit({ ...draft(), model_id: 'fake-model' }));
  assert.throws(() =>
    validateLimit({ ...draft(), value: { mode: 'UNLIMITED', unit: 'USD' } }),
  );
  assert.throws(() =>
    validateLimit({ ...draft(), allocation_mode: 'PER_MEMBER' }),
  );
  assert.throws(() =>
    validateLimit({
      ...draft(),
      usage_selector: { client_id: 'glean', period: PERIOD },
    }),
  );
  // Sending [] would clear thresholds configured elsewhere.
  assert.throws(() => validateLimit({ ...draft(), actions: [] }));
});
test('Evaluation takes a concrete target with its spend client and period', () => {
  validateEvaluation(sam);
  validateEvaluation(evaluation({ type: 'ORGANIZATION' }));
  for (const body of [
    evaluation({ type: 'DEFAULT_USER' }),
    evaluation({ type: 'ORGANIZATION', client_id: '*' }),
    { target: { type: 'ORGANIZATION' }, period: PERIOD },
    { target: sam.target },
    { ...sam, usage_selector: { client_id: 'glean', period: PERIOD } },
  ])
    assert.throws(() => validateEvaluation(body), ApiError);
});
test('Reset keys drop response-only fields such as email', () => {
  assert.deepEqual(
    limitKey({ ...draft(), target: { ...draft().target, email: 'a@b.test' } }),
    {
      target: { type: 'USER', client_id: 'glean', user_id: 'demo-sam' },
      period: PERIOD,
    },
  );
});
test('UTC exclusive windows, public filter grammar, and bounds are enforced', () => {
  validateSearch(query);
  for (const patch of [
    {
      time_range: {
        start: '2026-02-30T00:00:00Z',
        end: '2026-03-31T00:00:00Z',
      },
    },
    {
      time_range: {
        start: '2026-10-01T12:00:00Z',
        end: '2026-11-01T00:00:00Z',
      },
    },
    { granularity: 'HOUR' },
    { group_by: ['DEPARTMENT'] },
    { group_by: ['MODEL', 'MODEL'] },
    { page_size: 1001 },
    { filters: [{ field: 'department_name', values: ['Engineering'] }] },
    { filters: [{ field: 'client_id', values: ['__deleted_clients__'] }] },
    { sort: { field: 'PERIOD_START', unit: 'USD' } },
  ])
    assert.throws(() => validateSearch({ ...query, ...patch }));
  assert.throws(() =>
    validateSearch({
      ...query,
      target: { type: 'USER', user_id: 'u' },
      time_range: {
        start: '2026-09-01T00:00:00Z',
        end: '2026-11-01T00:00:00Z',
      },
    }),
  );
});
test('Ledger arithmetic uses exact micro-unit decimals', () => {
  assert.equal(decimal(micros('0.1') + micros('0.2')), '0.3');
  assert.equal(decimal(micros('987654321098.123456')), '987654321098.123456');
});
test('Demo reporting paginates without doubling totals or combining units', async () => {
  const provider = demo();
  const first = await provider.search(query);
  const second = await provider.search({ ...query, cursor: first.next_cursor });
  parseSearchResponse(first);
  assert.ok(first.has_more);
  assert.deepEqual(first.totals, second.totals);
  assert.deepEqual(
    first.totals.map((t) => t.unit),
    ['USD', 'CREDITS'],
  );
  assert.equal(first.data_updated_at, null);
  assert.equal(first.earliest_available_at, null);
  assert.notDeepEqual(first.results, second.results);
});
test('Demo cursor pins observations and rejects query changes or expiry', async () => {
  let now = new Date('2026-10-12T12:00:00Z');
  const p = createDemoProvider({ now: () => now });
  const first = await p.search(query);
  await assert.rejects(
    p.search({ ...query, cursor: first.next_cursor, page_size: 3 }),
    (e) => e.code === 'invalid_cursor',
  );
  await assert.rejects(
    p.search({
      ...query,
      cursor: first.next_cursor,
      filters: [{ field: 'client_id', values: ['glean'] }],
    }),
    (e) => e.code === 'invalid_cursor',
  );
  now = new Date('2026-10-13T00:01:00Z');
  const next = await p.search({ ...query, cursor: first.next_cursor });
  assert.deepEqual(next.totals, first.totals);
  now = new Date('2026-10-14T12:01:00Z');
  await assert.rejects(
    p.search({ ...query, cursor: first.next_cursor }),
    (e) => e.code === 'expired_cursor',
  );
});
test('Demo hydration returns only page-local observed labels', async () => {
  const r = await demo().search({
    ...query,
    granularity: 'NONE',
    group_by: ['USER'],
    include: ['DISPLAY_NAMES'],
  });
  assert.equal(Object.keys(r.labels.user_id).length, 2);
  for (const id of Object.keys(r.labels.user_id))
    assert.ok(r.results.some((b) => b.dimensions.user_id === id));
});
test('Missing labels and null attribution preserve measured amounts', async () => {
  const r = await demo().search({
    ...query,
    granularity: 'NONE',
    group_by: ['MODEL'],
    page_size: 100,
  });
  assert.ok(r.results.some((b) => b.dimensions.model_id === null));
  delete r.labels;
  assert.equal(parseSearchResponse(r), r);
});
test('No policies is explicit, not a fabricated unlimited cap', async () => {
  const r = await demo().evaluate(
    evaluation({
      type: 'USER',
      user_id: 'demo-sam',
      client_id: 'unknown-client',
    }),
  );
  parseEvaluation(r);
  assert.equal(r.applicable_policy_count, 0);
  assert.equal(r.decision, 'AVAILABLE');
  assert.deepEqual(r.decision_causes, []);
  assert.deepEqual(r.effective_limits, [{ mode: 'UNLIMITED' }]);
});
test('Demo saves upsert one policy and are isolated to one provider', async () => {
  const a = demo(),
    b = demo();
  const limit = draft({ amount: '750' });
  await a.save(limit);
  const saved = await a.save(limit);
  assert.deepEqual(saved.usage_limit, limit);
  assert.equal((await a.limits()).results.length, 4);
  assert.equal(
    (await b.limits()).results.find((l) => l.target.user_id === 'demo-sam')
      .value.amount,
    '600',
  );
  const r = parseEvaluation(await a.evaluate(sam));
  for (const field of ['used_by_unit', 'usage_selector'])
    assert.ok(!(field in r));
  assert.ok(r.evaluated_limits.every((l) => !('remaining' in l)));
});
test('Saving without actions preserves configured thresholds', async () => {
  const p = demo();
  const { usage_limit } = await p.save(
    makeLimit({
      type: 'DEFAULT_USER',
      clientId: 'glean',
      amount: '450',
      unit: 'CREDITS',
    }),
  );
  assert.deepEqual(usage_limit.actions, [{ type: 'NOTIFY', at_percent: 90 }]);
});
test('Reset removes one natural key and reports whether it existed', async () => {
  const p = demo();
  const key = limitKey(draft());
  assert.equal((await p.reset(key)).is_configuration_removed, true);
  assert.equal((await p.reset(key)).is_configuration_removed, false);
  const r = await p.evaluate(sam);
  assert.deepEqual(
    r.evaluated_limits.map((l) => l.target.type),
    ['ORGANIZATION', 'DEFAULT_USER'],
  );
});
test('User override replaces the default source while retaining organization policy', async () => {
  const p = demo();
  const q = sam;
  await p.save(draft({ amount: '750' }));
  const r = await p.evaluate(q);
  assert.equal(r.applicable_policy_count, 2);
  assert.deepEqual(
    r.evaluated_limits.map((l) => l.target.type),
    ['ORGANIZATION', 'USER'],
  );
  assert.equal(r.decision, 'AVAILABLE');
  assert.ok(r.evaluated_limits.every((l) => !('allocation_mode' in l)));
  await p.save(draft({ amount: '0', enforcement: 'SOFT' }));
  assert.equal((await p.evaluate(q)).decision, 'WARNING');
  await p.save(draft({ amount: '0', enforcement: 'HARD' }));
  const blocked = await p.evaluate(q);
  assert.equal(blocked.decision, 'BLOCKED');
  assert.deepEqual(blocked.decision_causes, [
    { decision: 'BLOCKED', budget_scope: 'TARGET', source_type: 'USER' },
  ]);
});
test('An exhausted organization pool is a shared cause for a user', async () => {
  const p = demo();
  await p.save(draft({ amount: '100000' }));
  await p.save(
    makeLimit({
      type: 'ORGANIZATION',
      clientId: 'glean',
      amount: '0',
      unit: 'CREDITS',
    }),
  );
  const r = await p.evaluate(sam);
  assert.equal(r.decision, 'BLOCKED');
  assert.deepEqual(r.decision_causes, [
    {
      decision: 'BLOCKED',
      budget_scope: 'SHARED',
      source_type: 'ORGANIZATION',
    },
  ]);
});
test('The premium policy restricts models on a user’s own limit only', async () => {
  const p = demo();
  await p.save(draft({ amount: '1' }));
  const r = await p.evaluate(sam);
  assert.deepEqual(r.restrictions, [
    {
      type: 'RESTRICT_MODELS',
      allow: { models: ['demo-standard-model'] },
      source: { type: 'DEFAULT_USER', client_id: '*' },
    },
  ]);
  const own = r.evaluated_limits.find((l) => l.target.type === 'USER');
  assert.deepEqual(
    own.active_actions.map((a) => a.type),
    ['RESTRICT_MODELS'],
  );
  const org = await p.evaluate(evaluation({ type: 'ORGANIZATION' }));
  assert.deepEqual(org.restrictions, []);
});
test('Sample writes enforce the client billing denomination', async () => {
  await assert.rejects(demo().save(draft({ unit: 'USD' })), /denomination/);
});
test('Org chart retains orphans and terminates on manager cycles', () => {
  assert.equal(buildOrgTree(USERS).length, 1);
  const forest = buildOrgTree([
    { user_id: 'a', manager: { user_id: 'b' } },
    { user_id: 'b', manager: { user_id: 'a' } },
    { user_id: 'c', manager: { user_id: 'missing' } },
  ]);
  assert.equal(forest.length, 3);
});
for (const origin of [
  'http://example.test',
  'https://u:p@example.test',
  'https://example.test/api',
  'https://example.test?q=x',
  'https://example.test#x',
  'https://example.test:8443',
])
  test(`Unsafe live origin rejected: ${origin}`, () =>
    assert.throws(() => validateOrigin(origin)));
test('Client picker carries gateway IDs, never constructs them from OAuth IDs', async () => {
  const calls = [];
  const provider = createLiveProvider({
    serverUrl: 'https://example.test',
    tokenProvider: async () => 'test-token',
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      return response({
        results: [
          {
            display_name: 'A',
            client_id: 'oauth-id',
            is_enabled: true,
            ai_gateway: {
              usage_client_id: 'verbatim-opaque-spend',
              supported_apps: [],
            },
          },
        ],
        has_more: false,
        request_id: 'r',
      });
    },
  });
  const r = await provider.catalog('clients');
  assert.deepEqual(JSON.parse(calls[0].searchParams.get('filters')), [
    { field: 'has_ai_gateway', values: ['true'] },
  ]);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].usage_client_id, 'verbatim-opaque-spend');
  assert.equal(r.results[0].oauth_client_id, 'oauth-id');
});
test('Live bridge uses experimental header, refreshable tokens, and the public upsert', async () => {
  const calls = [];
  let tokens = 0;
  const provider = createLiveProvider({
    serverUrl: 'https://example.test',
    tokenProvider: async () => `token-${++tokens}`,
    writes: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ usage_limit: draft(), request_id: 'r' });
    },
  });
  await provider.save(draft());
  await provider.save(draft());
  assert.equal(calls[0].url, 'https://example.test/api/admin/usage/limits');
  assert.deepEqual(JSON.parse(calls[0].init.body), draft());
  assert.equal(calls[0].init.headers['X-Glean-Include-Experimental'], 'true');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-2');
  assert.equal(calls[0].init.redirect, 'error');
});
test('Live reset sends the natural key and requires writes', async () => {
  const calls = [];
  const options = {
    serverUrl: 'https://example.test',
    tokenProvider: async () => 'token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ is_configuration_removed: true, request_id: 'r' });
    },
  };
  await assert.rejects(
    createLiveProvider(options).reset(limitKey(draft())),
    (e) => e.code === 'writes_disabled',
  );
  const r = await createLiveProvider({ ...options, writes: true }).reset(
    limitKey(draft()),
  );
  assert.equal(r.is_configuration_removed, true);
  assert.equal(
    calls[0].url,
    'https://example.test/api/admin/usage/limits/reset',
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), limitKey(draft()));
});
test('Live evaluation rejects responses missing required fields', async () => {
  const body = parseEvaluation(await demo().evaluate(sam));
  const provider = (r) =>
    createLiveProvider({
      serverUrl: 'https://example.test',
      tokenProvider: async () => 'token',
      fetchImpl: async () => response(r),
    });
  assert.deepEqual(await provider(body).evaluate(sam), body);
  const { decision_causes, ...withoutCauses } = body;
  await assert.rejects(
    provider(withoutCauses).evaluate(sam),
    (e) => e.code === 'invalid_response',
  );
});
test('Live writes require explicit opt-in and never retry ambiguous failures', async () => {
  let calls = 0;
  const options = {
    serverUrl: 'https://example.test',
    tokenProvider: async () => 'token',
    fetchImpl: async () => {
      calls++;
      throw new Error('do not expose token');
    },
  };
  await assert.rejects(
    createLiveProvider(options).save(draft()),
    (e) => e.code === 'writes_disabled',
  );
  assert.equal(calls, 0);
  await assert.rejects(
    createLiveProvider({ ...options, writes: true }).save(draft()),
    (e) =>
      e.code === 'upstream_unavailable' && !e.message.includes('expose token'),
  );
  assert.equal(calls, 1);
});
test('Upstream permission/unavailable errors never become empty demo responses', async () => {
  for (const status of [401, 403, 404, 422, 429, 503]) {
    const p = createLiveProvider({
      serverUrl: 'https://example.test',
      tokenProvider: async () => 'token',
      fetchImpl: async () =>
        response(
          { code: 'unavailable', request_id: 'req', details: 'secret' },
          status,
        ),
    });
    await assert.rejects(
      p.catalog('users'),
      (e) =>
        e.status === status &&
        e.requestId === 'req' &&
        !e.message.includes('secret'),
    );
  }
});
test('List pagination follows cursors, rejects cycles, and bounds reads', async () => {
  const calls = [];
  const p = createLiveProvider({
    serverUrl: 'https://example.test',
    tokenProvider: async () => 'token',
    fetchImpl: async (url) => {
      calls.push(url);
      return response({
        results: [],
        has_more: calls.length === 1,
        next_cursor: calls.length === 1 ? 'exact padded cursor' : null,
        request_id: 'r',
      });
    },
  });
  await p.limits();
  assert.equal(
    new URL(calls[1]).searchParams.get('cursor'),
    'exact padded cursor',
  );
  const loop = createLiveProvider({
    serverUrl: 'https://example.test',
    tokenProvider: async () => 'token',
    fetchImpl: async () =>
      response({
        results: [],
        has_more: true,
        next_cursor: 'same',
        request_id: 'r',
      }),
  });
  await assert.rejects(loop.limits(), (e) => e.code === 'invalid_response');
});
test('Malformed observed responses do not masquerade as empty success', () => {
  assert.throws(() =>
    parseSearchResponse({ results: [], has_more: true, request_id: 'r' }),
  );
});
test('Loopback server blocks cross-origin writes and DNS rebinding, serves CSP, and never exposes credentials', async (t) => {
  const server = createServer({ provider: demo() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
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
