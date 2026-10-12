import {
  ApiError,
  CATALOG_PATHS,
  SCOPES,
  parsePage,
  parseSearchResponse,
  validateLimit,
  validateSearch,
  validateEvaluation,
} from './contracts.mjs';

export function validateOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(
      'Set GLEAN_SERVER_URL to a complete HTTPS backend origin.',
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
      'GLEAN_SERVER_URL must be a credential-free HTTPS origin, not an API path.',
    );
  return url.origin;
}
export function createLiveProvider({
  serverUrl,
  tokenProvider,
  fetchImpl = fetch,
  writes = false,
  maxPages = 25,
}) {
  const origin = validateOrigin(serverUrl);
  async function request(
    path,
    body,
    method = body === undefined ? 'GET' : 'POST',
  ) {
    const token = await tokenProvider();
    if (!token)
      throw new ApiError(
        'Sign in first or configure a scoped token on the server.',
        401,
        'missing_credentials',
      );
    let res;
    try {
      res = await fetchImpl(`${origin}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Glean-Include-Experimental': 'true',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ApiError(
        'Upstream request timed out or could not connect. Writes are never automatically retried; reconcile the policy before retrying.',
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
    if (!res.ok)
      throw new ApiError(
        `Glean returned ${res.status}. Check endpoint rollout, scopes, billing permissions, and the request ID.`,
        res.status,
        typeof data.code === 'string' ? data.code : 'upstream_error',
        data.request_id,
      );
    return data;
  }
  return {
    mode: 'live',
    writes,
    async catalog(kind, cursor) {
      const path = CATALOG_PATHS[kind];
      if (!path) throw new ApiError('Unknown catalog.');
      // Never infer spend-client IDs from OAuth IDs. Only gateway-capable clients
      // become choices; Glean is a separate, documented spend client.
      const page = parsePage(
        await request(
          `${path}?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ),
      );
      if (kind === 'clients')
        page.results = page.results
          .filter((c) => c.is_active && c.ai_gateway?.usage_client_id)
          .map((c) => ({
            display_name: c.display_name,
            usage_client_id: c.ai_gateway.usage_client_id,
            oauth_client_id: c.client_id,
          }));
      return page;
    },
    async limits() {
      const results = [];
      const seen = new Set();
      let cursor;
      for (let i = 0; i < maxPages; i++) {
        const page = parsePage(
          await request(
            `/api/admin/usage/limits?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
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
    async search(query) {
      validateSearch(query);
      return parseSearchResponse(
        await request('/api/admin/usage/search', query),
      );
    },
    async evaluate(query) {
      validateEvaluation(query);
      const r = await request('/api/admin/usage/limits/evaluate', query);
      if (
        !Array.isArray(r.effective_limits) ||
        !Array.isArray(r.evaluated_limits) ||
        typeof r.applicable_policy_count !== 'number' ||
        !r.evaluated_at
      )
        throw new ApiError(
          'Malformed limit evaluation.',
          502,
          'invalid_response',
        );
      return r;
    },
    async save(limit) {
      validateLimit(limit);
      if (!writes)
        throw new ApiError(
          'Live writes are disabled. Restart with GLEAN_ENABLE_WRITES=true after verifying the workspace.',
          403,
          'writes_disabled',
        );
      // Single upsert is internal. The bounded public batch route accepts one item.
      const result = await request('/api/admin/usage/limits/batch', [limit]);
      if (!Array.isArray(result.results) || result.results.length !== 1)
        throw new ApiError(
          'Unexpected write response. Read the limit list before any retry.',
          502,
          'invalid_response',
        );
      return result;
    },
  };
}
export async function configuredLiveProvider(env = process.env) {
  const serverUrl = validateOrigin(env.GLEAN_SERVER_URL);
  // Lazy import keeps fixture mode network- and credential-free.
  const { createGleanTokenProvider } = await import('@gleanwork/auth');
  const tokenProvider = env.GLEAN_API_TOKEN
    ? async () => env.GLEAN_API_TOKEN
    : createGleanTokenProvider({ serverUrl, scopes: SCOPES });
  return createLiveProvider({
    serverUrl,
    tokenProvider,
    writes: env.GLEAN_ENABLE_WRITES === 'true',
  });
}
