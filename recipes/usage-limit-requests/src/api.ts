import {
  parseAdministrativeRequest,
  parseEvaluation,
  parsePage,
  parsePersonalRequest,
  parseResource,
  type PersonalRequestCreate,
  type RequestStatus,
  type ResolveRequest,
} from './requests.js';

const TIMEOUT_MS = 30_000;

/** A Platform Problem Details response, or a transport failure. */
export class GleanApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

export interface ListOptions {
  statuses?: RequestStatus[];
  cursor?: string;
  pageSize?: number;
}

function listQuery({ statuses, cursor, pageSize }: ListOptions) {
  const query = new URLSearchParams();
  if (pageSize) query.set('page_size', String(pageSize));
  if (cursor) query.set('cursor', cursor);
  if (statuses?.length) {
    query.set(
      'filters',
      JSON.stringify([{ field: 'status', values: statuses }]),
    );
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

/**
 * The limit-increase request and admin evaluation operations are not in the
 * released SDK yet. This bridge sends them with the same origin and token as
 * the SDK client and never retries a write.
 */
export function createUsageRequestsApi({
  origin,
  token,
}: {
  origin: string;
  token: string;
}) {
  async function send(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    { body, write = false }: { body?: unknown; write?: boolean } = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${origin}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Glean-Include-Experimental': 'true',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new GleanApiError(
        !write
          ? `Could not reach Glean: ${reason}`
          : `Could not confirm the change, so it may or may not have applied: ${reason}. Check the request before you try again.`,
        0,
        'connection_error',
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    if (!response.ok) {
      const problem = (data ?? {}) as Record<string, unknown>;
      throw new GleanApiError(
        typeof problem.detail === 'string'
          ? problem.detail
          : `Glean returned HTTP ${response.status}.`,
        response.status,
        typeof problem.code === 'string' ? problem.code : 'unknown',
        typeof problem.request_id === 'string' ? problem.request_id : undefined,
        response.headers.get('retry-after') ?? undefined,
      );
    }
    if (data === undefined) {
      throw new GleanApiError(
        `Glean returned a non-JSON response to ${method} ${path}.`,
        response.status,
        'invalid_response',
      );
    }
    return data;
  }

  const admin = '/api/admin/usage/limit-increase-requests';
  const personal = '/api/usage/limit-increase-requests';
  const id = (requestId: string) => `/${encodeURIComponent(requestId)}`;

  return {
    async listQueue(options: ListOptions = {}) {
      return parsePage(
        await send('GET', `${admin}${listQuery(options)}`),
        parseAdministrativeRequest,
      );
    },
    async getForReview(requestId: string) {
      return parseResource(
        await send('GET', `${admin}${id(requestId)}`),
        parseAdministrativeRequest,
      );
    },
    async resolve(requestId: string, update: ResolveRequest) {
      return parseResource(
        await send('PATCH', `${admin}${id(requestId)}`, {
          body: update,
          write: true,
        }),
        parseAdministrativeRequest,
      );
    },
    async listMine(options: ListOptions = {}) {
      return parsePage(
        await send('GET', `${personal}${listQuery(options)}`),
        parsePersonalRequest,
      );
    },
    async create(body: PersonalRequestCreate) {
      return parseResource(
        await send('POST', personal, { body, write: true }),
        parsePersonalRequest,
      );
    },
    async evaluateUser(userId: string, clientId: string) {
      return parseEvaluation(
        await send('POST', '/api/admin/usage/limits/evaluate', {
          body: {
            target: { type: 'USER', user_id: userId, client_id: clientId },
            period: { type: 'RECURRING_CALENDAR_MONTH' },
          },
        }),
      );
    },
  };
}

export type UsageRequestsApi = ReturnType<typeof createUsageRequestsApi>;
