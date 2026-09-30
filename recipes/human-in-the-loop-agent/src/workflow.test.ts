import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type {
  PlatformAgentRunState,
  PlatformAgentRunToolApproval,
} from '@gleanwork/api-client/models/components';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { Settings } from './client.js';
import { formatCliError } from './errors.js';
import { printRuns, runJson } from './review.js';
import { AgentRuns, type Run, type RunCall } from './runs.js';
import { drive, type Io } from './workflow.js';

const base = 'https://tenant.example';
const settings: Settings = {
  serverURL: base,
  apiToken: 'fixture-token',
  agentId: 'agent-1',
};
const runsUrl = `${base}/api/agents/agent-1/runs`;
const runUrl = `${runsUrl}/:runId`;
const responsesUrl = `${base}/api/agents/agent-1/responses`;
const cancellationsUrl = `${base}/api/agents/agent-1/cancellations`;

const server = setupServer();
const requests: { method: string; path: string; body: unknown }[] = [];
const pending: Promise<void>[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // Record in arrival order; the body is read asynchronously, so tests await
  // settled() before asserting.
  server.events.on('request:start', ({ request }) => {
    const entry = {
      method: request.method,
      path: new URL(request.url).pathname,
      body: undefined as unknown,
    };
    requests.push(entry);
    pending.push(
      request
        .clone()
        .text()
        .then((text) => {
          entry.body = text ? JSON.parse(text) : undefined;
        }),
    );
  });
});
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
  pending.length = 0;
});

async function settled() {
  await Promise.all(pending);
  return requests;
}
afterAll(() => server.close());

const approval = (id = 'call-1'): PlatformAgentRunToolApproval => ({
  interaction_id: id,
  type: 'TOOL_APPROVAL',
  tool_id: 'tool-1',
  display_name: 'Send Slack message to user',
  description: 'Glean will send a direct message in Slack to the current user.',
  arguments: { message: 'Cookbook approval test' },
});

function body(
  state: PlatformAgentRunState,
  extra: { pending?: PlatformAgentRunToolApproval[]; reply?: string } = {},
) {
  return {
    run: {
      run_id: 'run-1',
      agent_id: 'agent-1',
      state,
      created_at: '2026-09-28T12:00:00Z',
      updated_at: '2026-09-28T12:00:01Z',
      pending_interactions:
        extra.pending ?? (state === 'REQUIRES_INPUT' ? [approval()] : []),
      ...(extra.reply
        ? {
            output: {
              messages: [
                {
                  role: 'GLEAN_AI',
                  content: [{ type: 'text', text: extra.reply }],
                },
              ],
            },
          }
        : {}),
    },
    request_id: 'request-1',
  };
}

/** Serves the given GET states in order, repeating the last one. */
function serveStates(...states: ReturnType<typeof body>[]) {
  let i = 0;
  server.use(
    http.get(runUrl, () =>
      HttpResponse.json(states[Math.min(i++, states.length - 1)]),
    ),
  );
}

function recorder(answer?: 'APPROVE' | 'REJECT' | 'CANCEL' | null) {
  const lines: string[] = [];
  const questions: string[] = [];
  const io: Io = {
    log: (line) => lines.push(line),
    ask:
      answer === undefined
        ? undefined
        : async (question) => {
            questions.push(question);
            return answer;
          },
  };
  return { io, lines, questions, text: () => lines.join('\n') };
}

const runs = () => new AgentRuns(settings);
const fast = { pollIntervalMs: 1, waitSeconds: 5 };
const running = body('RUNNING').run as unknown as Run;

describe('starting a run', () => {
  test('creates one durable, non-streaming run and never retries it', async () => {
    server.use(
      http.post(runsUrl, () =>
        HttpResponse.json(body('RUNNING'), { status: 201 }),
      ),
    );
    const run = await runs().start('hello');
    expect(run.run_id).toBe('run-1');
    expect(await settled()).toEqual([
      {
        method: 'POST',
        path: '/api/agents/agent-1/runs',
        body: {
          execution_mode: 'DURABLE',
          stream: false,
          messages: [
            { role: 'USER', content: [{ type: 'text', text: 'hello' }] },
          ],
        },
      },
    ]);
  });

  test.each([
    ['a server error', () => HttpResponse.json({}, { status: 503 })],
    ['a network failure', () => HttpResponse.error()],
  ])('does not retry after %s', async (_name, reply) => {
    server.use(http.post(runsUrl, reply));
    await expect(runs().start('hello')).rejects.toThrow();
    expect(await settled()).toHaveLength(1);
  });

  // Both bodies are valid createRun responses to the SDK, so only the
  // recipe's own check stands between them and a run with no stored approvals.
  test.each([
    [
      'a wait-mode run',
      () =>
        HttpResponse.json({
          run: { agent_id: 'agent-1', status: 'success' },
          messages: [],
          request_id: 'r',
        }),
    ],
    [
      'a streamed reply',
      () =>
        new HttpResponse('event: done\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    ],
  ])(
    'refuses a response that is not a durable run: %s',
    async (_name, reply) => {
      server.use(http.post(runsUrl, reply));
      await expect(runs().start('hello')).rejects.toThrow(
        /did not return a durable run/,
      );
    },
  );

  test('explains a Glean instance without durable runs', async () => {
    server.use(
      http.post(runsUrl, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Bad request',
            status: 400,
            detail: 'property "execution_mode" is unsupported',
            code: 'INVALID_REQUEST',
            request_id: 'r',
          },
          {
            status: 400,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    );
    const error = await runs()
      .start('hello')
      .catch((e: unknown) => e);
    expect(formatCliError(error)).toEqual({
      error: 'HTTP 400: property "execution_mode" is unsupported',
      hint: 'Durable runs are not available on your Glean instance yet.',
    });
  });
});

describe('deciding', () => {
  test('shows the exact tool call, then approves that call only', async () => {
    serveStates(body('REQUIRES_INPUT'), body('SUCCEEDED', { reply: 'Sent.' }));
    server.use(
      http.post(responsesUrl, () => HttpResponse.json(body('RUNNING'))),
    );
    const out = recorder('APPROVE');

    expect(await drive(runs(), running, out.io, fast)).toBe(0);
    expect(out.text()).toMatch(/Tool: +Send Slack message to user/);
    expect(out.text()).toMatch(/"message": "Cookbook approval test"/);
    expect(out.questions).toHaveLength(1);
    expect((await settled()).filter((r) => r.method === 'POST')).toEqual([
      {
        method: 'POST',
        path: '/api/agents/agent-1/responses',
        body: {
          run_id: 'run-1',
          responses: [{ interaction_id: 'call-1', decision: 'APPROVE' }],
        },
      },
    ]);
    expect(out.text()).toMatch(/Agent: Sent\.\nRun run-1 succeeded\./);
  });

  test('rejects when the person rejects', async () => {
    serveStates(
      body('REQUIRES_INPUT'),
      body('SUCCEEDED', { reply: 'Not sent.' }),
    );
    server.use(
      http.post(responsesUrl, () => HttpResponse.json(body('RUNNING'))),
    );
    const out = recorder('REJECT');
    expect(await drive(runs(), running, out.io, fast)).toBe(0);
    expect(
      (await settled()).filter((r) => r.method === 'POST').map((r) => r.body),
    ).toEqual([
      {
        run_id: 'run-1',
        responses: [{ interaction_id: 'call-1', decision: 'REJECT' }],
      },
    ]);
  });

  test('pressing Enter sends nothing and leaves the run waiting', async () => {
    serveStates(body('REQUIRES_INPUT'));
    const out = recorder(null);
    expect(
      await drive(runs(), running, out.io, {
        ...fast,
        target: '--email "me@example.com"',
      }),
    ).toBe(2);
    expect((await settled()).every((r) => r.method === 'GET')).toBe(true);
    // The printed command must work as-is: it names the agent and backend.
    expect(out.lines).toContain(
      '  npm start -- resume --agent-id agent-1 --run-id run-1 --email "me@example.com"',
    );
    expect(out.text()).toMatch(/Nothing was sent/);
  });

  test('cancel cancels the run instead of answering it', async () => {
    serveStates(body('REQUIRES_INPUT'));
    server.use(
      http.post(cancellationsUrl, () => HttpResponse.json(body('CANCELLED'))),
    );
    const out = recorder('CANCEL');
    expect(await drive(runs(), running, out.io, fast)).toBe(0);
    expect((await settled()).filter((r) => r.method === 'POST')).toEqual([
      {
        method: 'POST',
        path: '/api/agents/agent-1/cancellations',
        body: { run_id: 'run-1' },
      },
    ]);
  });

  test('without a terminal, never decides and prints commands bound to the call', async () => {
    serveStates(body('REQUIRES_INPUT'));
    const out = recorder();
    expect(await drive(runs(), running, out.io, fast)).toBe(2);
    expect((await settled()).every((r) => r.method === 'GET')).toBe(true);
    expect(out.lines).toContain(
      '  npm start -- resume --agent-id agent-1 --run-id run-1 --decision approve --interaction-id call-1',
    );
  });

  test('an ID that could change a printed command is refused before any decision', async () => {
    serveStates(
      body('REQUIRES_INPUT', {
        pending: [{ ...approval(), interaction_id: 'x; rm -rf ~' }],
      }),
    );
    // Even with a person ready to approve, nothing is shown or sent.
    const out = recorder('APPROVE');
    await expect(drive(runs(), running, out.io, fast)).rejects.toThrow(
      /unexpected run or interaction ID\. Nothing was sent/,
    );
    expect(out.questions).toHaveLength(0);
    expect(out.text()).not.toMatch(/rm -rf/);
    expect((await settled()).every((r) => r.method === 'GET')).toBe(true);
  });

  test('a decision made ahead of time must name the pending call', async () => {
    serveStates(body('REQUIRES_INPUT'));
    const out = recorder();
    await expect(
      drive(runs(), running, out.io, {
        ...fast,
        decision: { value: 'APPROVE', interactionId: 'call-old' },
      }),
    ).rejects.toThrow(/not the pending approval \(call-1\)/);
    expect((await settled()).every((r) => r.method === 'GET')).toBe(true);
  });

  test('a second approval request is never covered by the first decision', async () => {
    serveStates(
      body('REQUIRES_INPUT'),
      body('REQUIRES_INPUT', { pending: [approval('call-2')] }),
    );
    server.use(
      http.post(responsesUrl, () => HttpResponse.json(body('RUNNING'))),
    );
    const out = recorder('APPROVE');
    await expect(drive(runs(), running, out.io, fast)).rejects.toThrow(
      /asked to run another tool/,
    );
    expect(out.questions).toHaveLength(1);
    expect((await settled()).filter((r) => r.method === 'POST')).toHaveLength(
      1,
    );
  });

  test('more than one pending call is refused, not partly answered', async () => {
    serveStates(
      body('REQUIRES_INPUT', { pending: [approval('a'), approval('b')] }),
    );
    const out = recorder('APPROVE');
    await expect(drive(runs(), running, out.io, fast)).rejects.toThrow(
      /one tool approval at a time.*cancel command/,
    );
    expect(out.questions).toHaveLength(0);
  });

  test('a run that never pauses is reported as a setup problem', async () => {
    serveStates(
      body('SUCCEEDED', {
        reply:
          'The message was not sent because the Slack messaging tool is unavailable.',
      }),
    );
    const out = recorder('APPROVE');
    expect(
      await drive(runs(), running, out.io, { ...fast, expectPause: true }),
    ).toBe(1);
    expect(out.questions).toHaveLength(0);
    expect(out.text()).toMatch(/finished without asking for approval/);
    expect(out.text()).toMatch(
      /"Allow agent to use write tools without approval" is unchecked/,
    );
  });

  test('resuming a run that already finished is not a setup problem', async () => {
    // For example, a slow resume after a rejection finished while no one was
    // watching, and the person picks it back up.
    serveStates(body('SUCCEEDED', { reply: 'The message was not sent.' }));
    const out = recorder('APPROVE');
    const done = body('SUCCEEDED').run as unknown as Run;
    expect(await drive(runs(), done, out.io, fast)).toBe(0);
    expect(out.questions).toHaveLength(0);
    expect(out.text()).not.toMatch(/without asking/);
    expect(out.text()).toMatch(/Run run-1 succeeded\./);
  });

  test('stopping at the deadline leaves the run going and says how to resume', async () => {
    serveStates(body('RUNNING'));
    const out = recorder('APPROVE');
    expect(
      await drive(runs(), running, out.io, {
        pollIntervalMs: 1,
        waitSeconds: 0.02,
      }),
    ).toBe(2);
    expect((await settled()).every((r) => r.method === 'GET')).toBe(true);
    expect(out.text()).toMatch(
      /still running[\s\S]*resume --agent-id agent-1 --run-id run-1/,
    );
  });

  test('tool arguments cannot hide or reorder text in the terminal', async () => {
    serveStates(
      body('REQUIRES_INPUT', {
        pending: [
          {
            ...approval(),
            arguments: { message: 'safe\u202egnp.exe\u200b\u001b[2J' },
          },
        ],
      }),
    );
    const out = recorder(null);
    await drive(runs(), running, out.io, fast);
    expect(out.text()).toContain('safe\\u202egnp.exe\\u200b\\u001b[2J');
    expect(out.text()).not.toMatch(/[\u202e\u200b\u001b]/u);
  });
});

describe('showing the run JSON', () => {
  test('every SDK call reports the run it returned', async () => {
    server.use(
      http.post(runsUrl, () =>
        HttpResponse.json(body('RUNNING'), { status: 201 }),
      ),
      http.get(runUrl, () => HttpResponse.json(body('REQUIRES_INPUT'))),
      http.post(responsesUrl, () => HttpResponse.json(body('RUNNING'))),
      http.post(cancellationsUrl, () => HttpResponse.json(body('CANCELLED'))),
    );
    const seen: [RunCall, string][] = [];
    const agentRuns = new AgentRuns(settings, {
      onRun: (call, run) => seen.push([call, run.state]),
    });
    await agentRuns.start('hello');
    await agentRuns.get('run-1');
    await agentRuns.respond('run-1', 'call-1', 'APPROVE');
    await agentRuns.cancel('run-1');
    expect(seen).toEqual([
      ['createRun', 'RUNNING'],
      ['getRun', 'REQUIRES_INPUT'],
      ['respondToRun', 'RUNNING'],
      ['cancelRun', 'CANCELLED'],
    ]);
  });

  test('prints each new run once, under the request that returned it', async () => {
    serveStates(
      body('RUNNING'),
      body('RUNNING'),
      body('REQUIRES_INPUT'),
      body('SUCCEEDED', { reply: 'Sent.' }),
    );
    server.use(
      http.post(responsesUrl, () => HttpResponse.json(body('RUNNING'))),
    );
    const printed: string[] = [];
    const agentRuns = new AgentRuns(settings, {
      onRun: printRuns((text) => printed.push(text)),
    });
    const out = recorder('APPROVE');

    expect(await drive(agentRuns, running, out.io, fast)).toBe(0);
    const blocks = printed.map((text) => {
      const [, heading, ...json] = text.split('\n');
      return [heading, (JSON.parse(json.join('\n')) as Run).state];
    });
    // The second RUNNING poll returned the same run, so it isn't repeated.
    expect(blocks).toEqual([
      ['getRun: GET /api/agents/{agent_id}/runs/{run_id}', 'RUNNING'],
      ['getRun: GET /api/agents/{agent_id}/runs/{run_id}', 'REQUIRES_INPUT'],
      ['respondToRun: POST /api/agents/{agent_id}/responses', 'RUNNING'],
      ['getRun: GET /api/agents/{agent_id}/runs/{run_id}', 'SUCCEEDED'],
    ]);
    expect(out.questions).toHaveLength(1);
  });

  test('run JSON is escaped for the terminal and still parses to the same run', () => {
    const { run } = body('REQUIRES_INPUT', {
      pending: [
        {
          ...approval(),
          arguments: { message: 'safe\u202egnp.exe\u200b\u009b2J\u001b[2J' },
        },
      ],
    });
    const text = runJson(run as unknown as Run);
    expect(text).not.toMatch(/[\u202e\u200b\u009b\u001b]/u);
    expect(JSON.parse(text)).toEqual(run);
  });
});
