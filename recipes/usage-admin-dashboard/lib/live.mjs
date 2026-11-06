import { Glean } from '@gleanwork/api-client';
import {
  GleanBaseError,
  ResponseValidationError,
  SDKValidationError,
} from '@gleanwork/api-client/models/errors';
import {
  ApiError,
  parseEvaluation,
  parsePage,
  validateEvaluation,
  validateLimit,
  validateLimitKey,
} from './contracts.mjs';

const queryString = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined)
      search.set(
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      );
  return `?${search}`;
};
// The list returns enabled static clients only; Glean's own spend client is the
// documented `glean` constant, and api-token-* clients are not listed.
const GATEWAY_CLIENTS = [{ field: 'has_ai_gateway', values: ['true'] }];
const PAGE_SIZE = 100;

export function validateOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(
      'Set GLEAN_SERVER_URL in .env to your Glean backend origin, such as https://your-instance-be.glean.com.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new ApiError(
      'The Glean backend must be a credential-free HTTPS origin, not an API path.',
    );
  return url.origin;
}
function upstreamError(status, data) {
  return new ApiError(
    `Glean returned ${status}. Check endpoint rollout, scopes, billing permissions, and the request ID.`,
    status,
    typeof data?.code === 'string' ? data.code : 'upstream_error',
    typeof data?.request_id === 'string' ? data.request_id : undefined,
  );
}
// SDK errors carry the raw upstream body; only its code and request ID leave
// this module, never the body itself.
function fromSdkError(error) {
  if (error instanceof ApiError) return error;
  if (
    error instanceof ResponseValidationError ||
    error instanceof SDKValidationError
  )
    return new ApiError(
      'Glean returned a response this SDK version does not recognize.',
      502,
      'invalid_response',
    );
  if (error instanceof GleanBaseError) {
    let data;
    try {
      data = JSON.parse(error.body);
    } catch {
      data = undefined;
    }
    return upstreamError(error.statusCode, data);
  }
  return new ApiError(
    'Upstream request timed out or could not connect.',
    503,
    'upstream_unavailable',
  );
}
export function createLiveProvider({
  serverUrl,
  tokenProvider,
  writes = false,
  maxPages = 25,
}) {
  const origin = validateOrigin(serverUrl);
  // A token provider failure is a credential problem, not a connection
  // problem, and its message never leaves this module.
  async function token() {
    let value;
    try {
      value = await tokenProvider();
    } catch {
      value = undefined;
    }
    if (!value)
      throw new ApiError(
        'No usable Glean credentials. Set GLEAN_API_TOKEN in .env to a Client API token.',
        401,
        'missing_credentials',
      );
    return value;
  }
  // Directory reads go through the official SDK, which may retry them. The
  // usage operations are not in the released SDK yet, so a narrow REST bridge
  // sends them and never retries a write.
  const glean = new Glean({
    serverURL: origin,
    apiToken: token,
    includeExperimental: true,
    timeoutMs: 30_000,
    retryConfig: {
      strategy: 'backoff',
      backoff: {
        initialInterval: 500,
        maxInterval: 5_000,
        exponent: 2,
        maxElapsedTime: 10_000,
      },
      retryConnectionErrors: true,
    },
  });
  async function request(path, body, { write = false } = {}) {
    const authorization = `Bearer ${await token()}`;
    let res;
    try {
      res = await fetch(`${origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          'X-Glean-Include-Experimental': 'true',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ApiError(
        write
          ? 'Upstream request timed out or could not connect, so the write may or may not have applied. Read the limit list before retrying.'
          : 'Upstream request timed out or could not connect.',
        503,
        'upstream_unavailable',
      );
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new ApiError(
        'Upstream returned a non-JSON response.',
        502,
        'invalid_response',
      );
    }
    if (!res.ok) throw upstreamError(res.status, data);
    return data;
  }
  function requireWrites() {
    if (!writes)
      throw new ApiError(
        'Live writes are disabled. Restart with GLEAN_ENABLE_WRITES=true after verifying the workspace.',
        403,
        'writes_disabled',
      );
  }
  const catalogs = {
    users: (cursor) => glean.users.list(PAGE_SIZE, cursor),
    departments: (cursor) => glean.departments.list(PAGE_SIZE, cursor),
    // SDK 0.20.18 still models OAuth clients with is_active, which the API
    // replaced with is_enabled, so this catalog stays on the REST bridge.
    clients: async (cursor) => {
      const page = parsePage(
        await request(
          `/api/admin/oauth/clients${queryString({
            page_size: String(PAGE_SIZE),
            cursor,
            filters: GATEWAY_CLIENTS,
          })}`,
        ),
      );
      // Usage limits take ai_gateway.usage_client_id, never the OAuth client_id.
      page.results = page.results.map((c) => ({
        display_name: c.display_name,
        usage_client_id: c.ai_gateway.usage_client_id,
        oauth_client_id: c.client_id,
      }));
      return page;
    },
  };
  return {
    mode: 'live',
    writes,
    async catalog(kind, cursor) {
      if (!Object.hasOwn(catalogs, kind))
        throw new ApiError('Unknown catalog.');
      try {
        return parsePage(await catalogs[kind](cursor));
      } catch (error) {
        throw fromSdkError(error);
      }
    },
    async limits() {
      const results = [];
      const seen = new Set();
      let cursor;
      for (let i = 0; i < maxPages; i++) {
        const page = parsePage(
          await request(
            `/api/admin/usage/limits${queryString({ page_size: String(PAGE_SIZE), cursor })}`,
          ),
        );
        results.push(...page.results);
        if (!page.has_more) return { ...page, results };
        if (seen.has(page.next_cursor))
          throw new ApiError(
            'Upstream repeated a cursor.',
            502,
            'invalid_response',
          );
        seen.add(page.next_cursor);
        cursor = page.next_cursor;
      }
      throw new ApiError(
        'Limit list exceeded the safety bound; narrow the query instead of displaying a partial list as complete.',
        413,
        'page_bound',
      );
    },
    async evaluate(body) {
      validateEvaluation(body);
      return parseEvaluation(
        await request('/api/admin/usage/limits/evaluate', body),
      );
    },
    async save(limit) {
      validateLimit(limit);
      requireWrites();
      const result = await request('/api/admin/usage/limits', limit, {
        write: true,
      });
      if (!result.usage_limit?.target)
        throw new ApiError(
          'Unexpected write response. Read the limit list before any retry.',
          502,
          'invalid_response',
        );
      return result;
    },
    async reset(key) {
      validateLimitKey(key);
      requireWrites();
      const result = await request('/api/admin/usage/limits/reset', key, {
        write: true,
      });
      if (typeof result.is_configuration_removed !== 'boolean')
        throw new ApiError(
          'Unexpected reset response. Read the limit list before any retry.',
          502,
          'invalid_response',
        );
      return result;
    },
  };
}
// Token-only: the Admin Console Client API token stays in this server
// process and never reaches the browser.
export function configuredLiveProvider(env = process.env) {
  const serverUrl = validateOrigin(env.GLEAN_SERVER_URL?.trim());
  const token = env.GLEAN_API_TOKEN?.trim();
  if (!token)
    throw new ApiError(
      'Set GLEAN_API_TOKEN in .env to a Client API token with the ADMIN_USAGE and PEOPLE scopes.',
      401,
      'missing_credentials',
    );
  return createLiveProvider({
    serverUrl,
    tokenProvider: async () => token,
    writes: env.GLEAN_ENABLE_WRITES === 'true',
  });
}
