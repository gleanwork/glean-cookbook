import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  batchKey,
  curlFor,
  decisionsFor,
  identifier,
  parseResponses,
  parseSnapshot,
  states,
  terminal,
} from '../public/model.js';
import { snapshot } from './fixtures.js';

test('all declared states are readable, but approval is nonterminal', () => {
  for (const state of states)
    assert.equal(parseSnapshot(snapshot(state)).run.state, state);
  assert.equal(terminal('REQUIRES_INPUT'), false);
  for (const state of ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const)
    assert.equal(terminal(state), true);
});
test('complete batch decisions are required and keep wire names', () => {
  const run = snapshot('REQUIRES_INPUT', ['a', 'b']);
  assert.throws(() => decisionsFor(run, new Map([['a', 'APPROVE']])));
  assert.deepEqual(
    decisionsFor(
      run,
      new Map([
        ['a', 'APPROVE'],
        ['b', 'REJECT'],
      ]),
    ),
    {
      responses: [
        { interaction_id: 'a', decision: 'APPROVE' },
        { interaction_id: 'b', decision: 'REJECT' },
      ],
    },
  );
  assert.throws(() => decisionsFor(snapshot('RUNNING'), new Map()));
});
test('unknown interactions, duplicate IDs, and argument edits fail closed', () => {
  const run = snapshot();
  run.run.pending_interactions[0]!.type = 'AUTH' as never;
  assert.throws(() => parseSnapshot(run));
  assert.throws(() =>
    parseSnapshot(snapshot('REQUIRES_INPUT', ['same', 'same'])),
  );
  const response = { interaction_id: 'a', decision: 'APPROVE' };
  assert.throws(() => parseResponses({ responses: [response, response] }));
  assert.throws(() =>
    parseResponses({ responses: [{ ...response, arguments: {} }] }),
  );
  assert.throws(() =>
    parseResponses({ responses: [response], session_grant: true }),
  );
});
test('a later batch or changed stored arguments invalidates the review key', () => {
  assert.notEqual(
    batchKey(snapshot()),
    batchKey(snapshot('REQUIRES_INPUT', ['approval_2'])),
  );
  const changed = snapshot();
  changed.run.pending_interactions[0]!.arguments.text = 'different';
  assert.notEqual(batchKey(snapshot()), batchKey(changed));
});
test('opaque IDs cannot alter routes', () => {
  for (const value of ['..', '.', 'a/b', 'a?b', '%2e%2e', '', 'a'.repeat(257)])
    assert.equal(identifier(value), false);
});
test('curl copy quotes shell metacharacters and contains only a credential variable', () => {
  const curl = curlFor({
    method: 'POST',
    path: '/api/agents/a/runs',
    request: { text: "it's $(touch nope)" },
    status: 201,
    body: {},
  });
  assert.ok(curl.includes("it'\\''s $(touch nope)"));
  assert.ok(curl.includes('$GLEAN_API_TOKEN'));
  assert.ok(!curl.includes('--retry'));
});
