import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  limitKey,
  makeLimit,
  parseEvaluation,
  parseSearchResponse,
} from '../lib/contracts.mjs';
import { createDemoProvider } from '../lib/demo.mjs';
import { demo, draft, evaluation, query, sam } from './fixtures.mjs';

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
