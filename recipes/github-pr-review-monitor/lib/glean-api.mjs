// One place that knows how to call the Glean Triggers API.
//
// The Triggers surface is experimental, so every request must carry
// `x-glean-include-experimental: true` -- without it the API answers 401 with
// `Not allowed`, which reads like a credential problem and sends you looking in
// the wrong place. Keeping the header here rather than in each script means a
// new caller cannot forget it, and `verify.mjs` asserts it is still present.

const EXPERIMENTAL_HEADER = 'x-glean-include-experimental';

export function apiBase(env = process.env) {
  const server = (env.GLEAN_SERVER_URL || '').replace(/\/$/u, '');
  if (!server) throw new Error('Set GLEAN_SERVER_URL in .env first.');
  return `${server}/api`;
}

export function apiHeaders(env = process.env) {
  const token = env.GLEAN_API_TOKEN;
  if (!token) throw new Error('Set GLEAN_API_TOKEN in .env first.');
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    [EXPERIMENTAL_HEADER]: 'true',
  };
}

export async function request(path, options = {}, env = process.env) {
  const response = await fetch(`${apiBase(env)}${path}`, {
    headers: apiHeaders(env),
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 401 on this surface usually means the OAuth grant was invalidated, not
    // that the token is malformed or the scope is missing -- a token can carry
    // `triggers` and still be refused. Re-running the login command is the fix.
    const hint =
      response.status === 401
        ? ' -- if the token looks valid, sign in again: the stored grant may have been revoked'
        : '';
    throw new Error(`${response.status} ${JSON.stringify(body)}${hint}`);
  }
  return body;
}

// The catalog is paged. Stopping at the first page would report a preset the
// deployment does serve as unavailable, which is the one thing setup must not do.
export async function allPresets(env = process.env) {
  const out = [];
  let cursor = '';
  do {
    const page = await request(
      `/trigger-presets?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      {},
      env,
    );
    out.push(...(page.results ?? []));
    cursor = page.has_more ? (page.next_cursor ?? '') : '';
  } while (cursor);
  return out;
}

// The catalog answers in two shapes, so reading it takes two calls: the list
// resolves the configured id, and the per-preset read is the only one carrying
// `inputs`. Anything reasoning about inputs must be handed this, not a list entry.
export async function readPreset(presetId, env = process.env) {
  const body = await request(
    `/trigger-presets/${encodeURIComponent(presetId)}`,
    {},
    env,
  );
  if (!body.trigger_preset) {
    throw new Error(
      `GET /trigger-presets/${presetId} returned no trigger_preset.`,
    );
  }
  // Identity from the id we resolved, so a narrower body than today's cannot
  // register a trigger with preset_id: undefined.
  return { preset_id: presetId, ...body.trigger_preset };
}

export async function listTriggers(env = process.env) {
  const out = [];
  let cursor = '';
  do {
    const page = await request(
      `/triggers?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      {},
      env,
    );
    out.push(...(page.results ?? []));
    cursor = page.has_more ? (page.next_cursor ?? '') : '';
  } while (cursor);
  return out;
}

// Re-pointing beats deleting. Signing secrets are returned once, at creation,
// so a rotated tunnel URL does not require new triggers: PATCH keeps the secret
// already in .env working. PUT is not supported on this collection.
export async function repointTrigger(triggerId, webhookUrl, env = process.env) {
  return request(
    `/triggers/${encodeURIComponent(triggerId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ delivery: { webhook_url: webhookUrl } }),
    },
    env,
  );
}

export async function searchTriggerEvents(
  triggerId,
  pageSize = 10,
  env = process.env,
) {
  return request(
    `/triggers/${encodeURIComponent(triggerId)}/events/search`,
    { method: 'POST', body: JSON.stringify({ page_size: pageSize }) },
    env,
  );
}
