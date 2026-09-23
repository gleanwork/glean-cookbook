import { setTimeout as sleep } from 'node:timers/promises';
import { Glean } from '@gleanwork/api-client';
import { HTTPClient } from '@gleanwork/api-client/lib/http.js';
import type { RequestOptions } from '@gleanwork/api-client/lib/sdks.js';
import type { PlatformDurableAgentRun } from '@gleanwork/api-client/models/components';
import type { PlatformAgentsCreateRunResponse } from '@gleanwork/api-client/models/operations';

export class RecipeError extends Error {}

export const ACTIVE = new Set(['QUEUED', 'RUNNING', 'CANCELLING']);
export const TERMINAL = new Set([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);

const REQUEST_OPTIONS = {
  retries: { strategy: 'none' },
  timeoutMs: 15_000,
  redirect: 'error',
} satisfies RequestOptions;

export interface Settings {
  serverURL: string;
  apiToken: string;
  agentId: string;
}

export interface Snapshot {
  run: PlatformDurableAgentRun;
  // The human reviews the wire JSON, not numbers rounded by JSON.parse.
  json: string;
}

export function settings(env: NodeJS.ProcessEnv = process.env): Settings {
  const names = ['GLEAN_SERVER_URL', 'GLEAN_API_TOKEN', 'GLEAN_AGENT_ID'];
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new RecipeError(`Set these values in .env: ${missing.join(', ')}`);
  let url: URL;
  try {
    url = new URL(env.GLEAN_SERVER_URL!.trim());
  } catch {
    throw new RecipeError(
      'GLEAN_SERVER_URL must be the HTTPS backend origin, without a path.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new RecipeError(
      'GLEAN_SERVER_URL must be the HTTPS backend origin, without a path.',
    );
  }
  return {
    serverURL: url.origin,
    apiToken: env.GLEAN_API_TOKEN!.trim(),
    agentId: env.GLEAN_AGENT_ID!.trim(),
  };
}

export function validateSnapshot(
  response: PlatformAgentsCreateRunResponse,
  agentId: string,
  runId?: string,
): PlatformDurableAgentRun {
  if (
    typeof response === 'string' ||
    !response.run ||
    !('pending_interactions' in response.run)
  ) {
    throw new RecipeError(
      'Expected a durable run snapshot. Confirm API deployment; do not retry creation.',
    );
  }
  const run = response.run;
  if (
    !run.run_id ||
    run.agent_id !== agentId ||
    (runId && run.run_id !== runId)
  ) {
    throw new RecipeError(
      'The returned agent/run identity does not match the request.',
    );
  }
  if (
    !ACTIVE.has(run.state) &&
    !TERMINAL.has(run.state) &&
    run.state !== 'REQUIRES_INPUT'
  ) {
    throw new RecipeError(
      'Unknown run state. Inspect the API contract before continuing.',
    );
  }
  return run;
}

export class AgentRuns {
  constructor(
    private readonly config: Settings,
    private readonly transport = new HTTPClient(),
  ) {}

  private async request(
    operation: (glean: Glean) => Promise<PlatformAgentsCreateRunResponse>,
    runId?: string,
  ): Promise<Snapshot> {
    // The SDK validates the response and owns serialization/error handling.
    // Its JSON.parse rounds large integers, so preserve the original JSON for
    // approval review. A per-request SDK hook keeps concurrent snapshots paired.
    let json = '';
    const httpClient = this.transport.clone();
    httpClient.addHook('response', async (response) => {
      json = await response.clone().text();
    });
    const glean = new Glean({
      ...this.config,
      httpClient,
      retryConfig: { strategy: 'none' },
    });
    const response = await operation(glean);
    const run = validateSnapshot(response, this.config.agentId, runId);
    return { run, json };
  }

  start(message: string): Promise<Snapshot> {
    if (!message.trim())
      throw new RecipeError('Set GLEAN_MESSAGE in .env or pass --message.');
    // Each POST creates a new execution. Never retry it blindly.
    return this.request((glean) =>
      glean.agents.createRun(
        {
          execution_mode: 'DURABLE',
          stream: false,
          messages: [
            { role: 'USER', content: [{ type: 'text', text: message }] },
          ],
        },
        this.config.agentId,
        REQUEST_OPTIONS,
      ),
    );
  }

  get(runId: string): Promise<Snapshot> {
    return this.request(
      (glean) =>
        glean.agents.getRun(this.config.agentId, runId, REQUEST_OPTIONS),
      runId,
    );
  }

  respond(
    runId: string,
    interactionId: string,
    decision: 'APPROVE' | 'REJECT',
  ): Promise<Snapshot> {
    // Use the ID the human reviewed; never substitute a newly polled ID.
    // One decision covers this recipe's complete single-tool approval batch.
    // The server rejects stale/incomplete batches and deduplicates accepted replays.
    return this.request(
      (glean) =>
        glean.agents.respondToRun(
          {
            run_id: runId,
            responses: [{ interaction_id: interactionId, decision }],
          },
          this.config.agentId,
          REQUEST_OPTIONS,
        ),
      runId,
    );
  }

  cancel(runId: string): Promise<Snapshot> {
    return this.request(
      (glean) =>
        glean.agents.cancelRun(
          { run_id: runId },
          this.config.agentId,
          REQUEST_OPTIONS,
        ),
      runId,
    );
  }
}

export function show(snapshot: Snapshot): void {
  // Do not log these arguments to a shared service. Escape terminal control
  // characters without parsing/re-serializing numbers in the approval preview.
  console.log(
    snapshot.json.replace(
      /[\u007f-\u009f]/gu,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    ),
  );
}

export function outcome(run: PlatformDurableAgentRun): number {
  if (run.state === 'FAILED' || run.state === 'EXPIRED') return 1;
  if (run.state === 'REQUIRES_INPUT') {
    if (
      run.pending_interactions.length !== 1 ||
      run.pending_interactions[0]?.type !== 'TOOL_APPROVAL'
    ) {
      console.error(
        'This recipe expects exactly one TOOL_APPROVAL. Do not approve a partial batch; cancel this run.',
      );
      return 1;
    }
    console.error(
      'Review the tool, destination, and arguments. Approval is never automatic.',
    );
  }
  return 0;
}

export async function watch(
  runs: AgentRuns,
  runId: string,
  seconds: number,
  pollIntervalMs = 2000,
): Promise<number> {
  const deadline = performance.now() + seconds * 1000;
  while (true) {
    const snapshot = await runs.get(runId);
    show(snapshot);
    if (!ACTIVE.has(snapshot.run.state)) return outcome(snapshot.run);
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      console.error(
        'Polling stopped. The run was NOT cancelled. Reuse this run ID to watch or cancel.',
      );
      return 2;
    }
    await sleep(Math.min(pollIntervalMs, remaining));
  }
}
