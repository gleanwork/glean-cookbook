import assert from 'node:assert/strict';
import test from 'node:test';
import { HTTPClient } from '@gleanwork/api-client/lib/http.js';
import type {
  PlatformAgentRunState,
  PlatformAgentRunToolApproval,
} from '@gleanwork/api-client/models/components';
import { GleanBaseError } from '@gleanwork/api-client/models/errors';
import {
  AgentRuns,
  outcome,
  settings,
  show,
  TERMINAL,
  validateSnapshot,
  watch,
} from './runs.js';
import { errorMessage, main, parseCommand } from './cli.js';

const config = {
  serverURL: 'https://tenant.example',
  apiToken: 'offline-test-token',
  agentId: 'agent-1',
};

function body(state: PlatformAgentRunState = 'RUNNING') {
  const pending: PlatformAgentRunToolApproval[] =
    state === 'REQUIRES_INPUT'
      ? [
          {
            interaction_id: 'approval-1',
            type: 'TOOL_APPROVAL',
            display_name: 'Send Slack message to channel',
            description: 'Post a message',
            tool_id: 'slack-send',
            arguments: {
              channel: 'test-channel',
              text: 'Test',
              large_integer: '__integer__',
            },
          },
        ]
      : [];
  return {
    run: {
      run_id: 'run-1',
      agent_id: 'agent-1',
      state,
      created_at: '2026-09-23T12:00:00Z',
      updated_at: '2026-09-23T12:00:01Z',
      pending_interactions: pending,
    },
    request_id: 'request-1',
  };
}

function response(value: unknown, status = 200) {
  // Raw numeric fixture: JavaScript cannot represent this integer as a Number.
  const json = JSON.stringify(value).replace(
    '"__integer__"',
    '9007199254740993',
  );
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problem(status: number) {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Request failed',
      status,
      detail: 'Do not log sensitive server payload',
      code: status === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
      request_id: 'request-1',
      ...(status === 422 ? { authentication_suggestions: [] } : {}),
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

function fixture(handler: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const http = new HTTPClient({
    fetcher: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return await handler(request);
    },
  });
  return { runs: new AgentRuns(config, http), requests };
}

await test('durable creation uses 201 and never approves automatically', async () => {
  const { runs, requests } = fixture(() =>
    response(body('REQUIRES_INPUT'), 201),
  );
  const snapshot = await runs.start('Test');
  assert.equal(snapshot.run.run_id, 'run-1');
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.method, 'POST');
  assert.equal(new URL(request.url).pathname, '/api/agents/agent-1/runs');
  assert.deepEqual(await request.json(), {
    execution_mode: 'DURABLE',
    stream: false,
    messages: [{ role: 'USER', content: [{ type: 'text', text: 'Test' }] }],
  });
  assert.equal(request.headers.has('X_GLEAN_INCLUDE_EXPERIMENTAL'), false);
  assert.equal(request.redirect, 'error');
});

await test('creation never retries a service error or unknown network outcome', async () => {
  for (const handler of [
    () => problem(503),
    () => {
      throw new TypeError('fetch failed');
    },
  ]) {
    const { runs, requests } = fixture(handler);
    await assert.rejects(runs.start('Test'));
    assert.equal(requests.length, 1);
  }
});

await test('request-bound responses cannot count as durable creation', async () => {
  const { runs } = fixture(() => response({ request_id: 'request-1' }));
  await assert.rejects(runs.start('Test'), /durable run snapshot/);
});

await test('fresh clients reconnect to the same run and preserve exact approval JSON', async (t) => {
  const output = t.mock.method(console, 'log', () => undefined);
  for (let i = 0; i < 2; i++) {
    const { runs, requests } = fixture(() => response(body('REQUIRES_INPUT')));
    const snapshot = await runs.get('run-1');
    assert.equal(requests[0]!.method, 'GET');
    assert.equal(
      new URL(requests[0]!.url).pathname,
      '/api/agents/agent-1/runs/run-1',
    );
    show(snapshot);
    // This demonstrates the SDK's rounding gap and prevents a rounded preview.
    assert.equal(
      snapshot.run.pending_interactions[0]!.arguments.large_integer,
      9007199254740992,
    );
    assert.match(snapshot.json, /9007199254740993/);
  }
  assert.equal(output.mock.calls.length, 2);
  assert.match(
    output.mock.calls[0]!.arguments[0] as string,
    /9007199254740993/,
  );
});

await test('concurrent request hooks keep each raw preview paired with its run', async () => {
  let release!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { runs } = fixture(async (request) => {
    const value = body('REQUIRES_INPUT');
    value.run.run_id = new URL(request.url).pathname.endsWith('/run-1')
      ? 'run-1'
      : 'run-2';
    if (value.run.run_id === 'run-1') await firstMayFinish;
    else release();
    return response(value);
  });
  const snapshots = await Promise.all([runs.get('run-1'), runs.get('run-2')]);
  for (const snapshot of snapshots) {
    assert.match(
      snapshot.json,
      new RegExp(`"run_id":"${snapshot.run.run_id}"`),
    );
  }
});

await test('approve, reject, and explicit replay use only the exact reviewed ID', async () => {
  for (const decision of ['APPROVE', 'REJECT'] as const) {
    const { runs, requests } = fixture(() => response(body()));
    for (let i = 0; i < 2; i++) {
      assert.equal(
        (await runs.respond('run-1', 'reviewed-id', decision)).run.run_id,
        'run-1',
      );
    }
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.method, 'POST');
      assert.equal(
        new URL(request.url).pathname,
        '/api/agents/agent-1/responses',
      );
      assert.deepEqual(await request.json(), {
        run_id: 'run-1',
        responses: [{ interaction_id: 'reviewed-id', decision }],
      });
    }
  }
});

await test('conflicting/stale decisions are not replaced or retried', async () => {
  const { runs, requests } = fixture(() => problem(409));
  await assert.rejects(
    runs.respond('run-1', 'old-id', 'APPROVE'),
    (error: unknown) =>
      error instanceof GleanBaseError && error.statusCode === 409,
  );
  assert.equal(requests.length, 1);
});

await test('cancellation uses the flat route and does not claim RUNNING means CANCELLED', async () => {
  const { runs, requests } = fixture(() => response(body()));
  assert.equal((await runs.cancel('run-1')).run.state, 'RUNNING');
  const request = requests[0]!;
  assert.equal(
    new URL(request.url).pathname,
    '/api/agents/agent-1/cancellations',
  );
  assert.deepEqual(await request.json(), { run_id: 'run-1' });
});

await test('watch stops at approval without sending decisions', async (t) => {
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const states: PlatformAgentRunState[] = [
    'QUEUED',
    'RUNNING',
    'REQUIRES_INPUT',
  ];
  const { runs, requests } = fixture(() => response(body(states.shift())));
  assert.equal(await watch(runs, 'run-1', 10, 1), 0);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.method === 'GET'));
});

await test('polling deadline does not cancel or restart', async (t) => {
  t.mock.method(console, 'log', () => undefined);
  const output = t.mock.method(console, 'error', () => undefined);
  const { runs, requests } = fixture(() => response(body()));
  assert.equal(await watch(runs, 'run-1', 0.001, 1), 2);
  assert.ok(requests.every((request) => request.method === 'GET'));
  assert.match(output.mock.calls[0]!.arguments[0] as string, /NOT cancelled/);
});

await test('every terminal state stops polling with the correct exit code', async (t) => {
  t.mock.method(console, 'log', () => undefined);
  for (const state of TERMINAL) {
    const { runs, requests } = fixture(() =>
      response(body(state as PlatformAgentRunState)),
    );
    assert.equal(
      await watch(runs, 'run-1', 10),
      ['FAILED', 'EXPIRED'].includes(state) ? 1 : 0,
    );
    assert.equal(requests.length, 1);
  }
});

await test('wrong agent/run identity and unknown states fail closed', async () => {
  for (const change of [
    { run_id: 'other' },
    { agent_id: 'other' },
    { state: 'NEW_STATE' },
  ]) {
    const value = body();
    Object.assign(value.run, change);
    const { runs } = fixture(() => response(value));
    await assert.rejects(runs.get('run-1'));
  }
  const { runs } = fixture(() => response(body()));
  const snapshot = await runs.get('run-1');
  assert.throws(
    () =>
      validateSnapshot(
        {
          run: { ...snapshot.run, state: 'NEW_STATE' as PlatformAgentRunState },
          request_id: 'r',
        },
        'agent-1',
      ),
    /Unknown run state/,
  );
});

await test('multiple approvals are not presented as supported', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const value = body('REQUIRES_INPUT');
  value.run.pending_interactions.push({
    ...value.run.pending_interactions[0]!,
    interaction_id: 'approval-2',
  });
  const { runs } = fixture(() => response(value));
  assert.equal(outcome((await runs.get('run-1')).run), 1);
});

await test('previews escape terminal controls without reserializing numeric arguments', async (t) => {
  const output = t.mock.method(console, 'log', () => undefined);
  const value = body('REQUIRES_INPUT');
  value.run.pending_interactions[0]!.description = 'untrusted\x1b[2J\u009b';
  const { runs } = fixture(() => response(value));
  show(await runs.get('run-1'));
  const json = output.mock.calls[0]!.arguments[0] as string;
  assert.doesNotMatch(json, /[\x1b\u009b]/u);
  assert.match(json, /9007199254740993/);
});

await test('settings require credentials and a valid HTTPS origin', () => {
  assert.throws(() => settings({}), /Set these values/);
  for (const url of [
    'invalid',
    'http://tenant.example',
    'https://tenant.example/api',
    'https://user:pass@tenant.example',
    'https://tenant.example/?q=1',
  ]) {
    assert.throws(
      () =>
        settings({
          GLEAN_SERVER_URL: url,
          GLEAN_API_TOKEN: 'test',
          GLEAN_AGENT_ID: 'agent-1',
        }),
      /HTTPS backend origin/,
    );
  }
  assert.deepEqual(
    settings({
      GLEAN_SERVER_URL: 'https://tenant.example/',
      GLEAN_API_TOKEN: ' test ',
      GLEAN_AGENT_ID: 'agent-1',
    }),
    { ...config, apiToken: 'test' },
  );
});

await test('CLI rejects blank/missing IDs, invalid durations, and irrelevant flags', () => {
  for (const args of [
    ['approve', '--run-id', ''],
    ['approve', '--run-id', 'run-1'],
    ['start', '--run-id', 'run-1'],
    ['cancel', '--run-id', 'run-1', '--message', 'x'],
    ['bogus'],
    ['status', 'extra', '--run-id', 'run-1'],
    ['start', '--unknown', 'x'],
    ['start', '--message', ' '],
    ...['-1', '0', 'NaN', 'Infinity'].map((seconds) => [
      'watch',
      '--run-id',
      'run-1',
      '--wait-seconds',
      seconds,
    ]),
  ])
    assert.throws(() => parseCommand(args));
  assert.equal(parseCommand(['--help']).command, 'help');
  assert.deepEqual(parseCommand(['watch', '--run-id', 'run-1']), {
    command: 'watch',
    runId: 'run-1',
    interactionId: undefined,
    message: undefined,
    waitSeconds: 120,
  });
});

await test('CLI dispatches each command with the reviewed IDs and message', async (t) => {
  const { runs } = fixture(() => response(body('SUCCEEDED')));
  const snapshot = await runs.get('run-1');
  const cases = [
    {
      name: 'start with an explicit message',
      args: ['start', '--message', 'CLI message'],
      method: 'start',
      expected: ['CLI message'],
    },
    {
      name: 'start with the configured message',
      args: ['start'],
      method: 'start',
      expected: ['Configured message'],
    },
    {
      name: 'status',
      args: ['status', '--run-id', 'run-1'],
      method: 'get',
      expected: ['run-1'],
    },
    {
      name: 'watch',
      args: ['watch', '--run-id', 'run-1'],
      method: 'get',
      expected: ['run-1'],
    },
    {
      name: 'cancel',
      args: ['cancel', '--run-id', 'run-1'],
      method: 'cancel',
      expected: ['run-1'],
    },
    ...(['approve', 'reject'] as const).map((decision) => ({
      name: decision,
      args: [decision, '--run-id', 'run-1', '--interaction-id', 'reviewed-id'],
      method: 'respond',
      expected: ['run-1', 'reviewed-id', decision.toUpperCase()],
    })),
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      const original = { ...process.env };
      t.after(() => {
        process.env = original;
      });
      Object.assign(process.env, {
        GLEAN_SERVER_URL: config.serverURL,
        GLEAN_API_TOKEN: config.apiToken,
        GLEAN_AGENT_ID: config.agentId,
        GLEAN_MESSAGE: 'Configured message',
      });
      t.mock.method(console, 'log', () => undefined);
      const methods = {
        start: t.mock.method(
          AgentRuns.prototype,
          'start',
          async () => snapshot,
        ),
        get: t.mock.method(AgentRuns.prototype, 'get', async () => snapshot),
        respond: t.mock.method(
          AgentRuns.prototype,
          'respond',
          async () => snapshot,
        ),
        cancel: t.mock.method(
          AgentRuns.prototype,
          'cancel',
          async () => snapshot,
        ),
      };

      assert.equal(await main(scenario.args), 0);
      for (const [name, method] of Object.entries(methods)) {
        assert.deepEqual(
          method.mock.calls.map((call) => call.arguments),
          name === scenario.method ? [scenario.expected] : [],
          `${name} must only be called by its matching command`,
        );
      }
    });
  }
});

await test('errors never print raw response payloads or retry writes', async () => {
  for (const status of [401, 403, 404, 409, 422, 429, 503]) {
    const { runs, requests } = fixture(() => problem(status));
    await assert.rejects(runs.start('Test'), (error: unknown) => {
      assert.match(errorMessage(error), new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(errorMessage(error), /sensitive server payload/);
      return true;
    });
    assert.equal(requests.length, 1);
  }
  assert.doesNotMatch(errorMessage(new Error('secret-token')), /secret-token/);
});
