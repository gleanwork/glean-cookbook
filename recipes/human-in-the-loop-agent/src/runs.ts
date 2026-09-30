import { setTimeout as sleep } from 'node:timers/promises';
import { Glean } from '@gleanwork/api-client';
import type { RequestOptions } from '@gleanwork/api-client/lib/sdks.js';
import type {
  PlatformAgentRunCreateRequest,
  PlatformAgentRunResponse,
  PlatformDurableAgentRun,
  PlatformAgentRunToolApproval,
} from '@gleanwork/api-client/models/components';
import type { PlatformAgentsCreateRunResponse } from '@gleanwork/api-client/models/operations';
import { RecipeError, type Settings } from './client.js';

export type Run = PlatformDurableAgentRun;
export type Approval = PlatformAgentRunToolApproval;
export type Decision = 'APPROVE' | 'REJECT';
/** The `glean.agents` method that returned a run. */
export type RunCall = 'createRun' | 'getRun' | 'respondToRun' | 'cancelRun';

/** One SDK call: the body sent, and the response Glean returned. */
export interface Exchange {
  call: RunCall;
  /** The request body; getRun sends none. */
  request?: object;
  /** The response as the SDK parsed it: the run and a request ID. */
  response: PlatformAgentRunResponse;
  run: Run;
}

export interface AgentRunsOptions {
  /** Receives every call after checkRun accepts the run it returned. */
  onCall?: (exchange: Exchange) => void;
}

/** States in which the run is still working and a poll will see progress. */
export const ACTIVE = new Set(['QUEUED', 'RUNNING', 'CANCELLING']);
/** IDs that can be printed into a shell command unchanged. */
export const SAFE_ID = /^[\w-]+$/;

export const TERMINAL = new Set([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);

// The client never retries (see the constructor): retrying a start after an
// unknown outcome creates a second run. The CLI tells the person what to check.
const REQUEST_OPTIONS = { timeoutMs: 15_000 } satisfies RequestOptions;

/**
 * Checks that a response is the durable run we asked about. `createRun` can
 * also return a streaming or wait-mode body; neither is a durable run, and a
 * run we didn't ask for must never receive a decision.
 */
export function checkRun(
  response: PlatformAgentsCreateRunResponse,
  agentId: string,
  runId?: string,
): Run {
  const run = typeof response === 'string' ? undefined : response.run;
  if (!run || !('pending_interactions' in run)) {
    throw new RecipeError(
      'Glean did not return a durable run. Check that durable runs are available on your Glean instance. Nothing was retried.',
    );
  }
  // The CLI prints these IDs into commands to copy. Check them on arrival,
  // before any decision is sent, rather than when a command is printed.
  const ids = [
    run.run_id,
    ...run.pending_interactions.map((p) => p.interaction_id),
  ];
  if (!ids.every((id) => SAFE_ID.test(id))) {
    throw new RecipeError(
      'Glean returned an unexpected run or interaction ID. Nothing was sent.',
    );
  }
  if (run.agent_id !== agentId || (runId && run.run_id !== runId)) {
    throw new RecipeError('The returned run does not match the one requested.');
  }
  return run;
}

/**
 * The single pending tool approval this recipe knows how to review, or null
 * when the run isn't waiting for one. Anything else is refused rather than
 * partially answered: the server needs a decision for every pending call.
 */
export function pendingApproval(run: Run): Approval | null {
  if (run.state !== 'REQUIRES_INPUT') return null;
  const [approval, ...rest] = run.pending_interactions;
  if (!approval || rest.length > 0 || approval.type !== 'TOOL_APPROVAL') {
    throw new RecipeError(
      `This recipe reviews one tool approval at a time; the run is waiting on ${run.pending_interactions.length}. Cancel it with the cancel command and this run ID.`,
    );
  }
  return approval;
}

/** The agent's last text reply, if the run produced one. */
export function lastReply(run: Run): string | undefined {
  const messages: unknown = run.output?.messages;
  if (!Array.isArray(messages)) return undefined;
  const texts = messages.flatMap((message: { content?: unknown }) =>
    Array.isArray(message?.content)
      ? message.content.flatMap((part: { type?: string; text?: unknown }) =>
          part?.type === 'text' &&
          typeof part.text === 'string' &&
          part.text.trim()
            ? [part.text.trim()]
            : [],
        )
      : [],
  );
  return texts.at(-1);
}

export class AgentRuns {
  private readonly glean: Glean;

  constructor(
    private readonly settings: Settings,
    private readonly options: AgentRunsOptions = {},
  ) {
    this.glean = new Glean({
      serverURL: settings.serverURL,
      apiToken: settings.apiToken,
      retryConfig: { strategy: 'none' },
    });
  }

  get agentId() {
    return this.settings.agentId;
  }

  private accept(
    call: RunCall,
    request: object | undefined,
    response: PlatformAgentsCreateRunResponse,
    runId?: string,
  ): Run {
    const run = checkRun(response, this.agentId, runId);
    this.options.onCall?.({
      call,
      request,
      response: response as PlatformAgentRunResponse,
      run,
    });
    return run;
  }

  /** Starts one durable run. Each call creates a new run; never retry it. */
  async start(message: string): Promise<Run> {
    const request: PlatformAgentRunCreateRequest = {
      execution_mode: 'DURABLE',
      stream: false,
      messages: [{ role: 'USER', content: [{ type: 'text', text: message }] }],
    };
    const response = await this.glean.agents.createRun(
      request,
      this.agentId,
      REQUEST_OPTIONS,
    );
    return this.accept('createRun', request, response);
  }

  async get(runId: string): Promise<Run> {
    const response = await this.glean.agents.getRun(
      this.agentId,
      runId,
      REQUEST_OPTIONS,
    );
    return this.accept('getRun', undefined, response, runId);
  }

  /**
   * Answers the approval the person reviewed. Pass the reviewed interaction ID,
   * never a newly polled one: the decision applies to that exact tool call.
   */
  async respond(runId: string, interactionId: string, decision: Decision) {
    const request = {
      run_id: runId,
      responses: [{ interaction_id: interactionId, decision }],
    };
    const response = await this.glean.agents.respondToRun(
      request,
      this.agentId,
      REQUEST_OPTIONS,
    );
    return this.accept('respondToRun', request, response, runId);
  }

  /** Requests cancellation. It stops future work; it can't undo finished work. */
  async cancel(runId: string): Promise<Run> {
    const request = { run_id: runId };
    const response = await this.glean.agents.cancelRun(
      request,
      this.agentId,
      REQUEST_OPTIONS,
    );
    return this.accept('cancelRun', request, response, runId);
  }

  /**
   * Polls until the run needs a decision or finishes. Returns the last run
   * seen if the deadline passes first; the run keeps going either way.
   */
  async wait(
    run: Run,
    { seconds = 120, intervalMs = 2000 } = {},
  ): Promise<Run> {
    const deadline = performance.now() + seconds * 1000;
    let current = run;
    while (ACTIVE.has(current.state)) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      await sleep(Math.min(intervalMs, remaining));
      current = await this.get(current.run_id);
    }
    return current;
  }
}
