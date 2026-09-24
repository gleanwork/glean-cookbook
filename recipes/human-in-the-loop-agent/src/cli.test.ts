import { afterEach, expect, test, vi } from 'vitest';
import { main, parseCommand } from './cli.js';
import { resolveSettings, type Settings } from './client.js';
import { AgentRuns, type Snapshot } from './runs.js';

vi.mock('./client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client.js')>()),
  loadDotEnv: vi.fn(),
  resolveSettings: vi.fn(),
}));

const settings: Settings = {
  serverURL: 'https://tenant.example',
  apiToken: 'fixture-token',
  agentId: 'agent-1',
};
const snapshot = {
  run: {
    run_id: 'run-1',
    agent_id: 'agent-1',
    state: 'SUCCEEDED',
    pending_interactions: [],
  },
  json: '{}',
} as unknown as Snapshot;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test.each([
  [['approve', '--run-id', '']],
  [['approve', '--run-id', 'run-1']],
  [['start', '--run-id', 'run-1']],
  [['cancel', '--run-id', 'run-1', '--message', 'x']],
  [['bogus']],
  [['status', 'extra', '--run-id', 'run-1']],
  [['start', '--unknown', 'x']],
  [['start', '--message', ' ']],
  [['start', '--email', ' ']],
  ...['-1', '0', 'NaN', 'Infinity'].map((seconds) => [
    ['watch', '--run-id', 'run-1', '--wait-seconds', seconds],
  ]),
])('rejects %j', (args) => {
  expect(() => parseCommand(args)).toThrow();
});

test('parses help and defaults', () => {
  expect(parseCommand(['--help']).command).toBe('help');
  expect(
    parseCommand(['watch', '--run-id', 'run-1', '--email', 'me@example.com']),
  ).toEqual({
    command: 'watch',
    runId: 'run-1',
    interactionId: undefined,
    message: undefined,
    waitSeconds: 120,
    target: { email: 'me@example.com', serverUrl: undefined },
  });
});

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

test.each(cases)(
  'dispatches $name with the reviewed IDs and message',
  async (scenario) => {
    vi.stubEnv('GLEAN_MESSAGE', 'Configured message');
    vi.mocked(resolveSettings).mockResolvedValue(settings);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const methods = {
      start: vi.spyOn(AgentRuns.prototype, 'start').mockResolvedValue(snapshot),
      get: vi.spyOn(AgentRuns.prototype, 'get').mockResolvedValue(snapshot),
      respond: vi
        .spyOn(AgentRuns.prototype, 'respond')
        .mockResolvedValue(snapshot),
      cancel: vi
        .spyOn(AgentRuns.prototype, 'cancel')
        .mockResolvedValue(snapshot),
    };

    expect(await main([...scenario.args, '--email', 'me@example.com'])).toBe(0);
    expect(resolveSettings).toHaveBeenCalledWith({
      email: 'me@example.com',
      serverUrl: undefined,
    });
    for (const [name, method] of Object.entries(methods)) {
      expect(
        method.mock.calls,
        `${name} must only run for its command`,
      ).toEqual(name === scenario.method ? [scenario.expected] : []);
    }
  },
);
