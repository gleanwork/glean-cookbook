import assert from 'node:assert/strict';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, test } from 'vitest';
import { limitKey, parseEvaluation } from '../lib/contracts.mjs';
import {
  createLiveProvider,
  resolveServerUrl,
  validateOrigin,
} from '../lib/live.mjs';
import { demo, draft, sam } from './fixtures.mjs';

const ORIGIN = 'https://example.test';
const api = (path) => `${ORIGIN}${path}`;
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const live = (options) =>
  createLiveProvider({
    serverUrl: ORIGIN,
    tokenProvider: async () => 'test-token',
    ...options,
  });
const problem = (status, headers = {}) =>
  HttpResponse.json(
    {
      type: 'about:blank',
      title: 'Request failed',
      status,
      detail: 'secret upstream detail',
      code: 'unavailable',
      request_id: 'req',
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', ...headers },
    },
  );

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
test('An explicit server URL wins over the environment, which is the fallback', async () => {
  const env = { GLEAN_SERVER_URL: 'https://env.example.test' };
  assert.equal(
    await resolveServerUrl({ serverUrl: ORIGIN, env }),
    'https://example.test',
  );
  assert.equal(await resolveServerUrl({ env }), 'https://env.example.test');
  await assert.rejects(resolveServerUrl({ env: {} }), /--email/);
});
test('Directory catalogs use the SDK with the experimental header and a fresh token', async () => {
  const fixtures = Object.fromEntries(
    await Promise.all(
      ['users', 'departments', 'groups'].map(async (kind) => [
        kind,
        await demo().catalog(kind),
      ]),
    ),
  );
  const requests = [];
  const respond =
    (kind) =>
    ({ request }) => {
      requests.push(request);
      return HttpResponse.json(fixtures[kind]);
    };
  server.use(
    http.get(api('/api/users'), respond('users')),
    http.get(api('/api/departments'), respond('departments')),
    http.get(api('/api/admin/idp-groups'), respond('groups')),
  );
  let tokens = 0;
  const provider = live({ tokenProvider: async () => `token-${++tokens}` });
  for (const kind of ['users', 'departments', 'groups'])
    assert.deepEqual(
      (await provider.catalog(kind)).results,
      fixtures[kind].results,
    );
  assert.equal(requests.length, 3);
  for (const [i, request] of requests.entries()) {
    assert.equal(request.headers.get('x-glean-include-experimental'), 'true');
    assert.equal(request.headers.get('authorization'), `Bearer token-${i + 1}`);
    assert.equal(new URL(request.url).searchParams.get('page_size'), '100');
  }
});
test('The SDK retries a transient directory read', async () => {
  let calls = 0;
  const users = await demo().catalog('users');
  server.use(
    http.get(api('/api/users'), () =>
      ++calls === 1
        ? problem(503, { 'Retry-After-Ms': '1' })
        : HttpResponse.json(users),
    ),
  );
  assert.equal(
    (await live().catalog('users')).results.length,
    users.results.length,
  );
  assert.equal(calls, 2);
});
test('Directory responses the SDK cannot parse are invalid, not empty', async () => {
  server.use(
    http.get(api('/api/users'), () =>
      HttpResponse.json({ results: 'not a list', request_id: 'r' }),
    ),
  );
  await assert.rejects(
    live().catalog('users'),
    (e) => e.code === 'invalid_response',
  );
});
test('Client picker carries gateway IDs, never constructs them from OAuth IDs', async () => {
  const urls = [];
  server.use(
    http.get(api('/api/admin/oauth/clients'), ({ request }) => {
      urls.push(new URL(request.url));
      return HttpResponse.json({
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
    }),
  );
  const r = await live().catalog('clients');
  assert.deepEqual(JSON.parse(urls[0].searchParams.get('filters')), [
    { field: 'has_ai_gateway', values: ['true'] },
  ]);
  assert.deepEqual(r.results, [
    {
      display_name: 'A',
      usage_client_id: 'verbatim-opaque-spend',
      oauth_client_id: 'oauth-id',
    },
  ]);
});
test('Upserts send the exact limit with the experimental header and a fresh token', async () => {
  const requests = [];
  server.use(
    http.post(api('/api/admin/usage/limits'), async ({ request }) => {
      requests.push({ headers: request.headers, body: await request.json() });
      return HttpResponse.json({ usage_limit: draft(), request_id: 'r' });
    }),
  );
  let tokens = 0;
  const provider = live({
    writes: true,
    tokenProvider: async () => `token-${++tokens}`,
  });
  await provider.save(draft());
  await provider.save(draft());
  assert.deepEqual(requests[0].body, draft());
  assert.equal(requests[0].headers.get('x-glean-include-experimental'), 'true');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer token-2');
});
test('Reset sends the natural key and requires writes', async () => {
  const bodies = [];
  server.use(
    http.post(api('/api/admin/usage/limits/reset'), async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({
        is_configuration_removed: true,
        request_id: 'r',
      });
    }),
  );
  await assert.rejects(
    live().reset(limitKey(draft())),
    (e) => e.code === 'writes_disabled',
  );
  assert.equal(bodies.length, 0);
  const r = await live({ writes: true }).reset(limitKey(draft()));
  assert.equal(r.is_configuration_removed, true);
  assert.deepEqual(bodies, [limitKey(draft())]);
});
test('Evaluation rejects responses missing required fields', async () => {
  const body = parseEvaluation(await demo().evaluate(sam));
  let response = body;
  server.use(
    http.post(api('/api/admin/usage/limits/evaluate'), () =>
      HttpResponse.json(response),
    ),
  );
  assert.deepEqual(await live().evaluate(sam), body);
  const { decision_causes, ...withoutCauses } = body;
  response = withoutCauses;
  await assert.rejects(
    live().evaluate(sam),
    (e) => e.code === 'invalid_response',
  );
});
test('Writes require explicit opt-in and never retry ambiguous failures', async () => {
  let calls = 0;
  let fail = () => HttpResponse.error();
  server.use(
    http.post(api('/api/admin/usage/limits'), () => {
      calls++;
      return fail();
    }),
  );
  await assert.rejects(
    live().save(draft()),
    (e) => e.code === 'writes_disabled',
  );
  assert.equal(calls, 0);
  await assert.rejects(
    live({ writes: true }).save(draft()),
    (e) => e.code === 'upstream_unavailable',
  );
  assert.equal(calls, 1);
  fail = () => problem(503, { 'Retry-After-Ms': '1' });
  await assert.rejects(
    live({ writes: true }).save(draft()),
    (e) => e.status === 503 && e.requestId === 'req',
  );
  assert.equal(calls, 2);
});
test('Upstream failures keep their status and request ID, never their body', async () => {
  let status;
  server.use(
    http.get(api('/api/users'), () => problem(status)),
    http.get(api('/api/admin/usage/limits'), () => problem(status)),
  );
  const rejectsWith = (promise) =>
    assert.rejects(
      promise,
      (e) =>
        e.status === status &&
        e.requestId === 'req' &&
        !e.message.includes('secret'),
    );
  for (status of [401, 403, 404, 422])
    await rejectsWith(live().catalog('users'));
  for (status of [401, 403, 404, 422, 429, 503])
    await rejectsWith(live().limits());
});
test('Limit pagination follows cursors, rejects cycles, and bounds reads', async () => {
  const cursors = [];
  server.use(
    http.get(api('/api/admin/usage/limits'), ({ request }) => {
      cursors.push(new URL(request.url).searchParams.get('cursor'));
      return HttpResponse.json({
        results: [],
        has_more: cursors.length === 1,
        next_cursor: cursors.length === 1 ? 'exact padded cursor' : null,
        request_id: 'r',
      });
    }),
  );
  await live().limits();
  assert.deepEqual(cursors, [null, 'exact padded cursor']);
  server.use(
    http.get(api('/api/admin/usage/limits'), () =>
      HttpResponse.json({
        results: [],
        has_more: true,
        next_cursor: 'same',
        request_id: 'r',
      }),
    ),
  );
  await assert.rejects(live().limits(), (e) => e.code === 'invalid_response');
});
