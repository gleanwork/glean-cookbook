import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  checkSnapshot,
  requiredEnv,
  run,
  sideEffects,
} from './verify/human-in-the-loop-agent.mjs';

const expected = { agentId: 'agent', runId: 'run', state: 'SUCCEEDED' };
const snapshot = {
  agent_id: 'agent',
  run_id: 'run',
  state: 'SUCCEEDED',
  pending_interactions: [],
};

test('a successful snapshot is partial evidence, never a live Slack pass', () => {
  assert.equal(sideEffects, 'read-only');
  assert.ok(requiredEnv.includes('GLEAN_API_TOKEN'));
  assert.ok(requiredEnv.includes('GLEAN_CANCELLED_RUN_ID'));
  assert.match(checkSnapshot(snapshot, expected).skip, /Slack counts/);
});

test('wrong run, wrong agent, pending interactions, and wrong state fail', () => {
  for (const change of [
    { run_id: 'other' },
    { agent_id: 'other' },
    { state: 'FAILED' },
    { pending_interactions: [{}] },
    { pending_interactions: undefined },
  ]) {
    assert.equal(
      typeof checkSnapshot({ ...snapshot, ...change }, expected),
      'string',
    );
  }
});

test('cancel verification needs CANCELLED, not just an accepted cancellation', () => {
  const cancelled = { ...expected, state: 'CANCELLED' };
  assert.equal(
    typeof checkSnapshot({ ...snapshot, state: 'RUNNING' }, cancelled),
    'string',
  );
  assert.ok(checkSnapshot({ ...snapshot, state: 'CANCELLED' }, cancelled).skip);
});

test('the verifier reads the compiled TypeScript CLI response envelope', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-verifier-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'recipes/human-in-the-loop-agent/dist');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'cli.js'),
    [
      `if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['status', '--run-id', 'run'])) process.exit(1);`,
      `console.log(${JSON.stringify(JSON.stringify({ run: snapshot, request_id: 'request' }))});`,
    ].join('\n'),
  );
  const original = { ...process.env };
  t.after(() => {
    process.env = original;
  });
  Object.assign(process.env, {
    GLEAN_AGENT_ID: 'agent',
    GLEAN_APPROVED_RUN_ID: 'run',
    GLEAN_REJECTED_RUN_ID: 'rejected-run',
    GLEAN_CANCELLED_RUN_ID: 'cancelled-run',
  });
  const result = await run('approval query', {
    repoRoot: root,
    recipe: { demoQueries: [{ query: 'approval query' }] },
  });
  assert.match(result.skip, /API snapshot checks passed/);
});
