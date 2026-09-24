import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type {
  PlatformAgentRunState,
  PlatformAgentRunToolApproval,
} from '@gleanwork/api-client/models/components';
import { GleanBaseError } from '@gleanwork/api-client/models/errors';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { errorMessage } from './cli.js';
import type { Settings } from './client.js';
import {
  AgentRuns,
  outcome,
  show,
  TERMINAL,
  validateSnapshot,
  watch,
} from './runs.js';

const baseUrl = 'https://tenant.example';
const config: Settings = {
  serverURL: baseUrl,
  apiToken: 'fixture-token',
  agentId: 'agent-1',
};
const runsUrl = `${baseUrl}/api/agents/agent-1/runs`;
const runUrl = `${runsUrl}/:runId`;
const responsesUrl = `${baseUrl}/api/agents/agent-1/responses`;
const cancellationsUrl = `${baseUrl}/api/agents/agent-1/cancellations`;

const server = setupServer();
const requests: Request[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', ({ request }) => {
    requests.push(request.clone());
  });
});
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
  vi.restoreAllMocks();
});
afterAll(() => {
  server.close();
});

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

function json(value: unknown, status = 200) {
  // Raw numeric fixture: JavaScript cannot represent this integer as a Number.
  const text = JSON.stringify(value).replace(
    '"__integer__"',
    '9007199254740993',
  );
  return new HttpResponse(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problem(status: number) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: 'Request failed',
      status,
      detail: 'Do not log sensitive server payload',
      code: status === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
      request_id: 'request-1',
      ...(status === 422 ? { authentication_suggestions: [] } : {}),
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

const runs = () => new AgentRuns(config);
const silence = () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
};

describe('creating a durable run', () => {
  test('uses 201, sends the token, and never approves automatically', async () => {
    server.use(http.post(runsUrl, () => json(body('REQUIRES_INPUT'), 201)));
    const snapshot = await runs().start('Test');
    expect(snapshot.run.run_id).toBe('run-1');
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
    expect(request.headers.has('X_GLEAN_INCLUDE_EXPERIMENTAL')).toBe(false);
    expect(request.redirect).toBe('error');
    expect(await request.json()).toEqual({
      execution_mode: 'DURABLE',
      stream: false,
      messages: [{ role: 'USER', content: [{ type: 'text', text: 'Test' }] }],
    });
  });

  test.each([
    ['a service error', () => problem(503)],
    ['an unknown network outcome', () => HttpResponse.error()],
  ])('never retries %s', async (_name, reply) => {
    server.use(http.post(runsUrl, reply));
    await expect(runs().start('Test')).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });

  test('a request-bound response cannot count as durable creation', async () => {
    server.use(http.post(runsUrl, () => json({ request_id: 'request-1' })));
    await expect(runs().start('Test')).rejects.toThrow(/durable run snapshot/);
  });

  test('a blank message is rejected before any request', async () => {
    await expect(runs().start('  ')).rejects.toThrow(/GLEAN_MESSAGE/);
    expect(requests).toHaveLength(0);
  });
});

describe('reading a run', () => {
  test('fresh clients reconnect to the same run and preserve exact approval JSON', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    server.use(http.get(runUrl, () => json(body('REQUIRES_INPUT'))));
    for (let i = 0; i < 2; i++) {
      const snapshot = await runs().get('run-1');
      show(snapshot);
      // This demonstrates the SDK's rounding gap and prevents a rounded preview.
      expect(
        snapshot.run.pending_interactions[0]!.arguments.large_integer,
      ).toBe(9007199254740992);
      expect(snapshot.json).toMatch(/9007199254740993/);
    }
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/api/agents/agent-1/runs/run-1',
      '/api/agents/agent-1/runs/run-1',
    ]);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toMatch(/9007199254740993/);
  });

  test('concurrent request hooks keep each raw preview paired with its run', async () => {
    let release!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(runUrl, async ({ params }) => {
        const value = body('REQUIRES_INPUT');
        value.run.run_id = String(params.runId);
        if (value.run.run_id === 'run-1') await firstMayFinish;
        else release();
        return json(value);
      }),
    );
    const client = runs();
    const snapshots = await Promise.all([
      client.get('run-1'),
      client.get('run-2'),
    ]);
    for (const snapshot of snapshots) {
      expect(snapshot.json).toMatch(
        new RegExp(`"run_id":"${snapshot.run.run_id}"`),
      );
    }
  });

  test('wrong agent/run identity and unknown states fail closed', async () => {
    for (const change of [
      { run_id: 'other' },
      { agent_id: 'other' },
      { state: 'NEW_STATE' },
    ]) {
      const value = body();
      Object.assign(value.run, change);
      server.use(http.get(runUrl, () => json(value)));
      await expect(runs().get('run-1')).rejects.toThrow();
    }
    server.use(http.get(runUrl, () => json(body())));
    const snapshot = await runs().get('run-1');
    expect(() =>
      validateSnapshot(
        {
          run: { ...snapshot.run, state: 'NEW_STATE' as PlatformAgentRunState },
          request_id: 'r',
        },
        'agent-1',
      ),
    ).toThrow(/Unknown run state/);
  });
});

describe('decisions and cancellation', () => {
  test.each(['APPROVE', 'REJECT'] as const)(
    '%s and its explicit replay use only the exact reviewed ID',
    async (decision) => {
      server.use(http.post(responsesUrl, () => json(body())));
      const client = runs();
      for (let i = 0; i < 2; i++) {
        const snapshot = await client.respond('run-1', 'reviewed-id', decision);
        expect(snapshot.run.run_id).toBe('run-1');
      }
      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(await request.json()).toEqual({
          run_id: 'run-1',
          responses: [{ interaction_id: 'reviewed-id', decision }],
        });
      }
    },
  );

  test('conflicting or stale decisions are not replaced or retried', async () => {
    server.use(http.post(responsesUrl, () => problem(409)));
    const error: unknown = await runs()
      .respond('run-1', 'old-id', 'APPROVE')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GleanBaseError);
    expect((error as GleanBaseError).statusCode).toBe(409);
    expect(requests).toHaveLength(1);
  });

  test('cancellation uses the flat route and does not claim RUNNING means CANCELLED', async () => {
    server.use(http.post(cancellationsUrl, () => json(body())));
    expect((await runs().cancel('run-1')).run.state).toBe('RUNNING');
    expect(await requests[0]!.json()).toEqual({ run_id: 'run-1' });
  });
});

describe('watching and presenting a run', () => {
  test('watch stops at approval without sending decisions', async () => {
    silence();
    const states: PlatformAgentRunState[] = [
      'QUEUED',
      'RUNNING',
      'REQUIRES_INPUT',
    ];
    server.use(http.get(runUrl, () => json(body(states.shift()))));
    expect(await watch(runs(), 'run-1', 10, 1)).toBe(0);
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  test('the polling deadline does not cancel or restart', async () => {
    const error = silence();
    server.use(http.get(runUrl, () => json(body())));
    expect(await watch(runs(), 'run-1', 0.001, 1)).toBe(2);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(error.mock.calls[0]![0]).toMatch(/NOT cancelled/);
  });

  test.each([...TERMINAL])(
    '%s stops polling with the correct exit code',
    async (state) => {
      silence();
      server.use(
        http.get(runUrl, () => json(body(state as PlatformAgentRunState))),
      );
      expect(await watch(runs(), 'run-1', 10)).toBe(
        ['FAILED', 'EXPIRED'].includes(state) ? 1 : 0,
      );
      expect(requests).toHaveLength(1);
    },
  );

  test('multiple approvals are not presented as supported', async () => {
    silence();
    const value = body('REQUIRES_INPUT');
    value.run.pending_interactions.push({
      ...value.run.pending_interactions[0]!,
      interaction_id: 'approval-2',
    });
    server.use(http.get(runUrl, () => json(value)));
    expect(outcome((await runs().get('run-1')).run)).toBe(1);
  });

  test('previews escape terminal controls without reserializing numeric arguments', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const value = body('REQUIRES_INPUT');
    value.run.pending_interactions[0]!.description = 'untrusted\x1b[2J\u009b';
    server.use(http.get(runUrl, () => json(value)));
    show(await runs().get('run-1'));
    const printed = log.mock.calls[0]![0] as string;
    expect(printed).not.toMatch(/[\x1b\u009b]/u);
    expect(printed).toMatch(/9007199254740993/);
  });
});

describe('errors', () => {
  test.each([401, 403, 404, 409, 422, 429, 503])(
    'HTTP %i is explained without printing the payload or retrying the write',
    async (status) => {
      server.use(http.post(runsUrl, () => problem(status)));
      const error: unknown = await runs()
        .start('Test')
        .catch((e: unknown) => e);
      expect(errorMessage(error)).toMatch(new RegExp(`HTTP ${status}`));
      expect(errorMessage(error)).not.toMatch(/sensitive server payload/);
      expect(requests).toHaveLength(1);
    },
  );

  test('arbitrary errors never echo their message', () => {
    expect(errorMessage(new Error('secret-token'))).not.toMatch(/secret-token/);
  });
});
