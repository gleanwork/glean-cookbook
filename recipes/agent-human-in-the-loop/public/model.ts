// Public wire names match the Agents API. There is no client-side workflow engine.
export const states = [
  'QUEUED',
  'RUNNING',
  'REQUIRES_INPUT',
  'SUCCEEDED',
  'FAILED',
  'CANCELLING',
  'CANCELLED',
  'EXPIRED',
] as const;
export type RunState = (typeof states)[number];
export type Decision = 'APPROVE' | 'REJECT';
export interface Interaction {
  interaction_id: string;
  type: 'TOOL_APPROVAL';
  tool_id?: string;
  display_name: string;
  description: string;
  arguments: Record<string, unknown>;
  expires_at?: string;
}
export interface Snapshot {
  request_id: string;
  run: {
    run_id: string;
    agent_id: string;
    state: RunState;
    created_at: string;
    updated_at: string;
    expires_at?: string;
    pending_interactions: Interaction[];
    output?: Record<string, unknown>;
    error?: { code: string; message: string };
  };
}
export interface Responses {
  responses: { interaction_id: string; decision: Decision }[];
}
export interface Exchange {
  method: string;
  path: string;
  request?: unknown;
  status: number;
  body: unknown;
  retryAfterSeconds?: number;
}
export const terminal = (state: RunState) =>
  ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(state);
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function identifier(value: unknown): value is string {
  // Opaque path identifiers: do not let dot segments or separators change the route.
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
}
export function parseSnapshot(value: unknown): Snapshot {
  if (
    !record(value) ||
    typeof value.request_id !== 'string' ||
    !record(value.run)
  ) {
    throw new Error(
      'Expected a persisted run snapshot with run and request_id.',
    );
  }
  const run = value.run;
  if (
    !identifier(run.run_id) ||
    !identifier(run.agent_id) ||
    !states.includes(run.state as RunState) ||
    typeof run.created_at !== 'string' ||
    typeof run.updated_at !== 'string' ||
    !Array.isArray(run.pending_interactions)
  ) {
    throw new Error(
      'The run snapshot does not match the documented API contract.',
    );
  }
  const ids = new Set<string>();
  for (const item of run.pending_interactions) {
    if (
      !record(item) ||
      !identifier(item.interaction_id) ||
      ids.has(item.interaction_id) ||
      item.type !== 'TOOL_APPROVAL' ||
      typeof item.display_name !== 'string' ||
      typeof item.description !== 'string' ||
      !record(item.arguments)
    ) {
      throw new Error(
        'Cannot safely review this pending interaction. Inspect the API response.',
      );
    }
    ids.add(item.interaction_id);
  }
  if (run.state !== 'REQUIRES_INPUT' && ids.size) {
    throw new Error('Unexpected pending interactions outside REQUIRES_INPUT.');
  }
  return value as unknown as Snapshot;
}
export function parseResponses(value: unknown): Responses {
  if (
    !record(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.responses) ||
    !value.responses.length ||
    value.responses.length > 100
  ) {
    throw new Error('Supply 1–100 invocation decisions in responses.');
  }
  const ids = new Set<string>();
  for (const item of value.responses) {
    if (
      !record(item) ||
      Object.keys(item).length !== 2 ||
      !identifier(item.interaction_id) ||
      ids.has(item.interaction_id) ||
      !['APPROVE', 'REJECT'].includes(String(item.decision))
    ) {
      throw new Error(
        'Each unique interaction_id needs APPROVE or REJECT; argument edits are not supported.',
      );
    }
    ids.add(item.interaction_id);
  }
  return value as unknown as Responses;
}
export function decisionsFor(
  snapshot: Snapshot,
  choices: Map<string, Decision>,
): Responses {
  if (
    snapshot.run.state !== 'REQUIRES_INPUT' ||
    !snapshot.run.pending_interactions.length
  ) {
    throw new Error('This run has no pending approval batch.');
  }
  return parseResponses({
    responses: snapshot.run.pending_interactions.map((item) => ({
      interaction_id: item.interaction_id,
      decision: choices.get(item.interaction_id),
    })),
  });
}
export function batchKey(snapshot: Snapshot): string {
  return JSON.stringify([
    snapshot.run.run_id,
    snapshot.run.pending_interactions,
  ]);
}
export function curlFor(exchange: Exchange): string {
  // Shell-quote untrusted tool arguments; never interpolate an actual credential.
  const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  const body =
    exchange.request === undefined
      ? ''
      : ` \\\n  --data ${quote(JSON.stringify(exchange.request, null, 2))}`;
  return `curl --fail-with-body --silent --show-error --max-time 60 \\\n  --request ${exchange.method} "$GLEAN_SERVER_URL${exchange.path}" \\\n  -H "Authorization: Bearer $GLEAN_API_TOKEN" \\\n  -H 'Content-Type: application/json'${body}`;
}
export const stateHelp: Record<RunState, string> = {
  QUEUED: 'Accepted; waiting to execute.',
  RUNNING:
    'Execution is active. GET observes progress; it does not advance the run.',
  REQUIRES_INPUT:
    'Review the stored invocation arguments. The pending invocation has not executed.',
  SUCCEEDED:
    'Execution completed. Check output and the destination; success alone does not prove a post occurred.',
  FAILED:
    'Execution failed. An HTTP 200 can still retrieve a FAILED run. External tool work may not have stopped.',
  CANCELLING: 'Cancellation is in progress. Keep polling for the final state.',
  CANCELLED:
    'Cancellation was recorded. Completed external effects were not rolled back.',
  EXPIRED:
    'The API reports an expired run. This client does not infer expiry from time spent waiting.',
};
