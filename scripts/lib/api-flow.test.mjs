import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { materializeApiFlow, resolvePointer } from './api-flow.mjs';

const FILES = {
  'flow/start.request.json': { name: 'demo' },
  'flow/start.response.json': { run: { run_id: 'run-1', state: 'RUNNING' } },
  'flow/answer.request.json': { run_id: 'run-1', decision: 'APPROVE' },
  'flow/answer.response.json': { run: { run_id: 'run-1', state: 'DONE' } },
};

function withRecipe(run, files = FILES) {
  const recipeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-flow-'));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(recipeDir, name)), { recursive: true });
    fs.writeFileSync(
      path.join(recipeDir, name),
      typeof body === 'string' ? body : JSON.stringify(body),
    );
  }
  try {
    run(recipeDir);
  } finally {
    fs.rmSync(recipeDir, { recursive: true, force: true });
  }
}

function entry({ inputs, start = {}, answer = {} } = {}) {
  return {
    id: 'flow-example',
    apiFlow: {
      intro: 'Each call reuses a value.',
      inputs: inputs ?? [{ value: 'decision', description: 'Chosen by you.' }],
      calls: [
        {
          title: 'Start',
          description: 'Start a run.',
          method: 'POST',
          path: '/runs',
          request: { source: 'flow/start.request.json' },
          response: { source: 'flow/start.response.json' },
          highlights: [
            { in: 'response', pointer: '/run/run_id', value: 'run_id' },
            { in: 'response', pointer: '/run/state', note: 'Running.' },
          ],
          ...start,
        },
        {
          title: 'Answer',
          description: 'Answer the run.',
          method: 'POST',
          path: '/runs/{run_id}/answers',
          request: { source: 'flow/answer.request.json' },
          response: { source: 'flow/answer.response.json' },
          highlights: [
            { in: 'path', param: 'run_id', value: 'run_id' },
            { in: 'request', pointer: '/run_id', value: 'run_id' },
            { in: 'request', pointer: '/decision', value: 'decision' },
          ],
          ...answer,
        },
      ],
    },
  };
}

test('embeds normalized request and response bodies', () => {
  withRecipe((recipeDir) => {
    const { apiFlow } = materializeApiFlow(entry(), recipeDir);
    assert.equal(
      apiFlow.calls[0].response.body,
      JSON.stringify(FILES['flow/start.response.json'], null, 2),
    );
    assert.equal(apiFlow.calls[1].request.source, 'flow/answer.request.json');
    assert.equal(apiFlow.calls[1].highlights.length, 3);
  });
});

test('leaves recipes without a flow unchanged', () => {
  const plain = { id: 'plain' };
  assert.equal(materializeApiFlow(plain, os.tmpdir()), plain);
});

test('rejects an authored body', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeApiFlow(
          entry({
            start: {
              response: { source: 'flow/start.response.json', body: '{}' },
            },
          }),
          recipeDir,
        ),
      /body is generated/,
    );
  });
});

test('rejects a source outside the recipe or not JSON', () => {
  withRecipe(
    (recipeDir) => {
      assert.throws(
        () =>
          materializeApiFlow(
            entry({ start: { response: { source: '../escape.json' } } }),
            recipeDir,
          ),
        /must stay inside/,
      );
      assert.throws(
        () =>
          materializeApiFlow(
            entry({ start: { response: { source: 'flow/bad.json' } } }),
            recipeDir,
          ),
        /not valid JSON/,
      );
    },
    { ...FILES, 'flow/bad.json': '{ nope' },
  );
});

test('rejects a highlight that points at a missing field', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeApiFlow(
          entry({
            start: {
              highlights: [
                { in: 'response', pointer: '/run/id', value: 'run_id' },
              ],
            },
          }),
          recipeDir,
        ),
      /response \/run\/id does not exist/,
    );
  });
});

test('rejects a highlight with neither a value nor a note', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeApiFlow(
          entry({
            start: {
              highlights: [
                { in: 'response', pointer: '/run/run_id', value: 'run_id' },
                { in: 'response', pointer: '/run/state' },
              ],
            },
          }),
          recipeDir,
        ),
      /needs a value to link or a note/,
    );
  });
});

test('rejects a value that no earlier response returns', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () => materializeApiFlow(entry({ inputs: [] }), recipeDir),
      /uses decision, but no earlier response returns it/,
    );
  });
});

test('rejects a request whose example differs from the earlier response', () => {
  withRecipe(
    (recipeDir) => {
      assert.throws(
        () => materializeApiFlow(entry(), recipeDir),
        /request \/run_id is "run-2", but the earlier response returned run_id as "run-1"/,
      );
    },
    {
      ...FILES,
      'flow/answer.request.json': { run_id: 'run-2', decision: 'APPROVE' },
    },
  );
});

test('rejects a path parameter without a highlight', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeApiFlow(
          entry({
            answer: {
              highlights: [
                { in: 'request', pointer: '/run_id', value: 'run_id' },
                { in: 'request', pointer: '/decision', value: 'decision' },
              ],
            },
          }),
          recipeDir,
        ),
      /highlight \{run_id\}/,
    );
  });
});

test('rejects returned values and inputs that nothing uses', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeApiFlow(
          entry({
            answer: {
              highlights: [
                { in: 'path', param: 'run_id', value: 'run_id' },
                { in: 'request', pointer: '/decision', value: 'decision' },
                { in: 'response', pointer: '/run/state', value: 'state' },
              ],
            },
          }),
          recipeDir,
        ),
      /returns state, but no later call uses it/,
    );
    assert.throws(
      () =>
        materializeApiFlow(
          entry({
            inputs: [
              { value: 'decision', description: 'Chosen by you.' },
              { value: 'agent_id', description: 'Unused.' },
            ],
          }),
          recipeDir,
        ),
      /input agent_id is never used/,
    );
  });
});

test('resolves JSON Pointer escapes and array indices', () => {
  const document = { 'a/b': [{ 'c~d': 1 }] };
  assert.deepEqual(resolvePointer(document, '/a~1b/0/c~0d'), {
    found: true,
    value: 1,
  });
  assert.deepEqual(resolvePointer(document, '/a~1b/1'), { found: false });
  assert.deepEqual(resolvePointer(document, '/a~1b/01'), { found: false });
});
