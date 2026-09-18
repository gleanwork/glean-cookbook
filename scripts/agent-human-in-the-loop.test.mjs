import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as verifier from './verify/agent-human-in-the-loop.mjs';

const root = new URL('../recipes/agent-human-in-the-loop/', import.meta.url);
const recipe = JSON.parse(
  fs.readFileSync(new URL('recipe.json', root), 'utf8'),
);
const readme = fs.readFileSync(new URL('README.md', root), 'utf8');

test('HITL page commands are the literal README commands, not a repaired workflow', () => {
  const commands = [...readme.matchAll(/```bash\n([\s\S]*?)```/g)].map(
    (match) => match[1].trimEnd(),
  );
  for (const step of recipe.steps.filter((item) => item.command)) {
    assert.ok(
      commands.includes(step.command),
      `${step.title} differs from the README`,
    );
  }
  assert.equal(
    recipe.execution.run.command,
    recipe.steps.find((step) => step.kind === 'run').command,
  );
  assert.equal(
    recipe.steps.filter((step) => /^cd /m.test(step.command ?? '')).length,
    1,
  );
  assert.ok(
    recipe.steps
      .find((step) => step.title === 'Start a durable run')
      .command.includes('> run-id.txt'),
  );
});

test('HITL remains preview-only without a fabricated live verification date', () => {
  assert.equal(recipe.visibility, 'preview');
  assert.equal(recipe.lastVerified, undefined);
  assert.ok(recipe.preview.caption.includes('Synthetic'));
});

test('HITL live preflight cannot treat a current snapshot as external-effect verification', async () => {
  assert.equal(verifier.sideEffects, 'read-only');
  const snapshot = {
    run: {
      state: 'REQUIRES_INPUT',
      pending_interactions: [
        {
          type: 'TOOL_APPROVAL',
          interaction_id: 'i',
          display_name: 'Post',
          arguments: { channel: 'test' },
        },
      ],
    },
  };
  for (const item of recipe.demoQueries) {
    const result = await verifier.run(item.query, { recipe, snapshot });
    assert.ok(result.skip?.startsWith('BLOCKED:'));
  }
  const wrongState = await verifier.run(recipe.demoQueries[0].query, {
    recipe,
    snapshot: { run: { state: 'SUCCEEDED' } },
  });
  assert.equal(typeof wrongState, 'string');
});
