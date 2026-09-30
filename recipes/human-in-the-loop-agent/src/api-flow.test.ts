import fs from 'node:fs';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { printCalls } from './review.js';
import { AgentRuns } from './runs.js';
import { drive } from './workflow.js';

// The recipe page shows these example bodies. Serving them to the real SDK
// proves the page shows what the CLI sends, receives, and prints.
interface FlowCall {
  sdkMethod: string;
  method: string;
  path: string;
  request?: { source: string };
  response: { source: string };
}

interface RunBody {
  run: { run_id: string; agent_id: string };
}
interface StartBody {
  messages: { content: { text: string }[] }[];
}

const read = (source: string): unknown =>
  JSON.parse(fs.readFileSync(new URL(`../${source}`, import.meta.url), 'utf8'));
const { apiFlow } = read('recipe.json') as { apiFlow: { calls: FlowCall[] } };
const calls = apiFlow.calls.map((call) => ({
  ...call,
  requestBody: call.request ? read(call.request.source) : undefined,
  responseBody: read(call.response.source),
}));

const base = 'https://tenant.example';
const { run: started } = calls[0]!.responseBody as RunBody;
const ids: Record<string, string> = {
  agent_id: started.agent_id,
  run_id: started.run_id,
};
const concrete = (path: string) =>
  path.replace(/\{(\w+)\}/g, (_, name: string) => ids[name] ?? name);

const server = setupServer();
const requests: { method: string; path: string; body: unknown }[] = [];
const pending: Promise<void>[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
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
afterAll(() => server.close());

/** Serves each call's example response in order, repeating the last one. */
function serveFlow() {
  const queues = new Map<string, unknown[]>();
  for (const call of calls) {
    const key = `${call.method} ${concrete(call.path)}`;
    queues.set(key, [...(queues.get(key) ?? []), call.responseBody]);
  }
  for (const [key, bodies] of queues) {
    const [method, path] = key.split(' ') as [string, string];
    server.use(
      http.all(`${base}${path}`, ({ request }) => {
        if (request.method !== method) return undefined;
        const next = bodies.length > 1 ? bodies.shift() : bodies[0];
        return HttpResponse.json(next as object);
      }),
    );
  }
}

test('the page shows the requests the CLI sends and the responses it prints', async () => {
  serveFlow();
  const printed: string[] = [];
  const runs = new AgentRuns(
    { serverURL: base, apiToken: 'fixture-token', agentId: started.agent_id },
    { onCall: printCalls((text) => printed.push(text)) },
  );
  const lines: string[] = [];
  const { messages } = calls[0]!.requestBody as StartBody;
  const message = messages[0]!.content[0]!.text;

  const code = await drive(
    runs,
    await runs.start(message),
    { log: (line) => lines.push(line), ask: async () => 'APPROVE' },
    { pollIntervalMs: 1, waitSeconds: 5, expectPause: true },
  );

  expect(code).toBe(0);
  expect(lines).toContain('Agent: Sent your Slack message.');
  await Promise.all(pending);
  expect(requests).toEqual(
    calls.map((call) => ({
      method: call.method,
      path: concrete(call.path),
      body: call.requestBody,
    })),
  );
  expect(
    printed.map((text) => {
      const [, heading, ...rest] = text.split('\n');
      const split = rest.indexOf('Response body:');
      return {
        heading,
        request:
          split > 0
            ? (JSON.parse(rest.slice(1, split).join('\n')) as unknown)
            : undefined,
        response: JSON.parse(rest.slice(split + 1).join('\n')) as unknown,
      };
    }),
  ).toEqual(
    calls.map((call) => ({
      heading: `${call.sdkMethod.split('.').at(-1)}: ${call.method} ${call.path}`,
      request: call.requestBody,
      response: call.responseBody,
    })),
  );
});
