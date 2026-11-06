import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  ApiError,
  PERIOD,
  buildOrgTree,
  decimal,
  limitKey,
  micros,
  parseSearchResponse,
  validateEvaluation,
  validateLimit,
  validateSearch,
} from '../lib/contracts.mjs';
import { USERS } from '../lib/demo.mjs';
import { draft, evaluation, query, sam } from './fixtures.mjs';

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
test('Org chart retains orphans and terminates on manager cycles', () => {
  assert.equal(buildOrgTree(USERS).length, 1);
  const forest = buildOrgTree([
    { user_id: 'a', manager: { user_id: 'b' } },
    { user_id: 'b', manager: { user_id: 'a' } },
    { user_id: 'c', manager: { user_id: 'missing' } },
  ]);
  assert.equal(forest.length, 3);
});
test('Malformed observed responses do not masquerade as empty success', () => {
  assert.throws(() =>
    parseSearchResponse({ results: [], has_more: true, request_id: 'r' }),
  );
});
