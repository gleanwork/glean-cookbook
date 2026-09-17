import { createGleanTokenProvider } from '@gleanwork/auth';
import {
  identifier,
  parseResponses,
  type Exchange,
  type Responses,
} from '../public/model.js';

export function backendOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'GLEAN_SERVER_URL must be a complete HTTPS backend origin, without credentials or a path.',
    );
  }
  return url.origin;
}

// Four endpoint-specific calls, not a workflow runner. No POST is automatically retried.
export function createAgentRuns(options: {
  serverUrl: string;
  agentId: string;
  token?: () => Promise<string>;
  fetch?: typeof fetch;
}) {
  const origin = backendOrigin(options.serverUrl);
  if (!identifier(options.agentId))
    throw new Error('Set a valid GLEAN_AGENT_ID.');
  const getToken =
    options.token ??
    createGleanTokenProvider({ serverUrl: origin, scopes: ['agents.run'] });
  const requestFetch = options.fetch ?? fetch;
  const collection = `/api/agents/${encodeURIComponent(options.agentId)}/runs`;
  const runPath = (runId: string) => {
    if (!identifier(runId)) throw new Error('Supply a valid run ID.');
    return `${collection}/${encodeURIComponent(runId)}`;
  };
  async function request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Exchange> {
    const token = await getToken();
    const response = await requestFetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', // Do not forward credentials through an unexpected redirect.
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(token ? text.replaceAll(token, '[REDACTED]') : text);
    } catch {
      data = {
        error:
          'The API returned a non-JSON response. Check the backend origin and HTTP status.',
      };
    }
    const retryAfter = response.headers.get('retry-after');
    const seconds =
      retryAfter === null
        ? NaN
        : /^\d+$/.test(retryAfter)
          ? Number(retryAfter)
          : Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000);
    return {
      method,
      path,
      request: body,
      status: response.status,
      body: data,
      ...(Number.isFinite(seconds) ? { retryAfterSeconds: seconds } : {}),
    };
  }
  return {
    create(message: string) {
      if (!message.trim() || message.length > 16_000)
        throw new Error('Supply a message of 1–16000 characters.');
      return request('POST', collection, {
        execution_mode: 'DURABLE',
        stream: false,
        messages: [
          { role: 'USER', content: [{ type: 'text', text: message }] },
        ],
      });
    },
    get: (runId: string) => request('GET', runPath(runId)),
    respond: (runId: string, responses: Responses) =>
      request('POST', `${runPath(runId)}/responses`, parseResponses(responses)),
    cancel: (runId: string) =>
      request('POST', `${runPath(runId)}/cancellations`),
  };
}
export type AgentRuns = ReturnType<typeof createAgentRuns>;
