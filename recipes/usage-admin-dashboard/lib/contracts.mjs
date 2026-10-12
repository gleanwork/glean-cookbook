// REST bridge for experimental operations not yet in the released cookbook SDK.
// Paths and fields are traced in docs/API-COVERAGE.md. Remove this bridge once
// a released SDK covers them; OAuth remains owned by @gleanwork/auth.
export const PERIOD = { type: 'RECURRING_CALENDAR_MONTH' };
export const SCOPES = [
  'users:read',
  'departments:read',
  'admin.usage:read',
  'admin.usage:evaluate',
  'admin.usage.limits:read',
  'admin.usage.limits:write',
  'admin.oauth.clients:read',
  'admin.idp_groups:read',
];
export const CATALOG_PATHS = Object.freeze({
  users: '/api/users',
  departments: '/api/departments',
  clients: '/api/admin/oauth/clients',
  groups: '/api/admin/idp-groups',
});
export class ApiError extends Error {
  constructor(message, status = 400, code = 'invalid_request', requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const nonblank = (v) => typeof v === 'string' && v.trim().length > 0;
export function exactKeys(value, allowed) {
  if (!object(value) || Object.keys(value).some((k) => !allowed.includes(k)))
    throw new ApiError('Unexpected request fields.');
}
export function validateClientId(id) {
  if (
    !nonblank(id) ||
    id.length > 256 ||
    /[\x00-\x1f\x7f]/u.test(id) ||
    id === '__deleted_clients__'
  )
    throw new ApiError('Choose a valid opaque spend-client ID.');
  return id; // Intentionally never trim, prefix, or normalize an ID.
}
export function validateTarget(target, { defaults = false } = {}) {
  exactKeys(target, ['type', 'user_id']);
  if (
    !['ORGANIZATION', 'USER', ...(defaults ? ['DEFAULT_USER'] : [])].includes(
      target.type,
    )
  )
    throw new ApiError(
      'This recipe supports organization and user targets only. Department, group, and model limit writes are not supported.',
      422,
      'unsupported_target',
    );
  if (target.type === 'USER' ? !nonblank(target.user_id) : 'user_id' in target)
    throw new ApiError(
      'A USER requires a canonical user_id; other targets must omit it.',
    );
}
export function validateLimit(limit) {
  exactKeys(limit, ['target', 'usage_selector', 'value', 'allocation_mode']);
  validateTarget(limit.target, { defaults: true });
  exactKeys(limit.usage_selector, ['client_id', 'period']);
  validateClientId(limit.usage_selector.client_id);
  exactKeys(limit.usage_selector.period, ['type']);
  if (limit.usage_selector.period.type !== PERIOD.type)
    throw new ApiError('Only recurring calendar-month limits are supported.');
  const allocation = {
    ORGANIZATION: 'SHARED_POOL',
    DEFAULT_USER: 'PER_MEMBER',
  }[limit.target.type];
  if (
    allocation
      ? limit.allocation_mode !== allocation
      : 'allocation_mode' in limit
  )
    throw new ApiError('Invalid allocation mode for this target.');
  exactKeys(limit.value, ['mode', 'amount', 'unit', 'enforcement']);
  if (limit.value.mode === 'UNLIMITED') {
    if (Object.keys(limit.value).length !== 1)
      throw new ApiError('Unlimited must omit amount, unit, and enforcement.');
  } else if (
    limit.value.mode !== 'FINITE' ||
    typeof limit.value.amount !== 'string' ||
    limit.value.amount.length > 24 ||
    !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u.test(limit.value.amount) ||
    !['USD', 'CREDITS'].includes(limit.value.unit) ||
    !['HARD', 'SOFT'].includes(limit.value.enforcement)
  ) {
    throw new ApiError(
      'Finite limits need a nonnegative decimal string (up to six places), the spend domain’s billing unit, and HARD or SOFT enforcement.',
    );
  }
  return limit;
}
export function makeLimit({
  type,
  userId,
  clientId,
  amount,
  unit,
  enforcement = 'HARD',
  unlimited = false,
}) {
  const limit = {
    target: type === 'USER' ? { type, user_id: userId } : { type },
    usage_selector: { client_id: clientId, period: PERIOD },
    value: unlimited
      ? { mode: 'UNLIMITED' }
      : { mode: 'FINITE', amount, unit, enforcement },
  };
  if (type === 'ORGANIZATION') limit.allocation_mode = 'SHARED_POOL';
  if (type === 'DEFAULT_USER') limit.allocation_mode = 'PER_MEMBER';
  return validateLimit(limit);
}
export function validateSearch(query) {
  exactKeys(query, [
    'target',
    'time_range',
    'granularity',
    'group_by',
    'filters',
    'sort',
    'include',
    'page_size',
    'cursor',
  ]);
  validateTarget(query.target);
  exactKeys(query.time_range, ['start', 'end']);
  const { start, end } = query.time_range;
  const midnight = /^\d{4}-\d{2}-\d{2}T00:00:00Z$/u;
  const valid = (v) =>
    midnight.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().replace('.000Z', 'Z') === v;
  if (!valid(start) || !valid(end) || end <= start)
    throw new ApiError(
      'Use valid UTC midnight bounds with an exclusive end after start.',
    );
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  const granularity = query.granularity ?? 'NONE';
  if (!['NONE', 'DAY', 'WEEK', 'MONTH'].includes(granularity))
    throw new ApiError('Invalid granularity.');
  const maxDays =
    query.target.type === 'USER' && granularity === 'DAY' ? 31 : 180;
  const anniversary = new Date(start);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  if (
    ['DAY', 'WEEK'].includes(granularity)
      ? days > maxDays
      : Date.parse(end) > +anniversary
  )
    throw new ApiError('Time range exceeds this query’s bound.');
  const groups = query.group_by ?? [];
  if (
    !Array.isArray(groups) ||
    groups.length > 5 ||
    new Set(groups).size !== groups.length ||
    groups.some(
      (g) =>
        !['PRODUCT', 'FEATURE', 'MODEL', 'CLIENT', 'AGENT', 'USER'].includes(g),
    )
  )
    throw new ApiError(
      'Choose supported grouping dimensions; department and IdP-group reporting are deferred.',
      422,
      'unsupported_dimension',
    );
  if (
    query.page_size !== undefined &&
    (!Number.isInteger(query.page_size) ||
      query.page_size < 1 ||
      query.page_size > 1000)
  )
    throw new ApiError('page_size must be 1–1000.');
  if (
    query.cursor !== undefined &&
    (!nonblank(query.cursor) || query.cursor.length > 512)
  )
    throw new ApiError('Invalid opaque cursor.');
  if (
    query.include !== undefined &&
    (!Array.isArray(query.include) ||
      query.include.some((v) => !['DISPLAY_NAMES', 'TOTAL_COUNT'].includes(v)))
  )
    throw new ApiError('Invalid include value.');
  if (query.filters !== undefined) {
    if (!Array.isArray(query.filters) || query.filters.length > 20)
      throw new ApiError('At most 20 filters are allowed.');
    for (const f of query.filters) {
      exactKeys(f, ['field', 'values', 'operator']);
      if (
        ![
          'product',
          'feature',
          'model_id',
          'client_id',
          'agent_id',
          'user_id',
        ].includes(f.field) ||
        !Array.isArray(f.values) ||
        f.values.length < 1 ||
        f.values.length > 100 ||
        f.values.some((v) => !nonblank(v) || v.length > 512) ||
        !['EQUALS', 'NOT_EQUALS'].includes(f.operator ?? 'EQUALS')
      )
        throw new ApiError('Invalid or deferred usage filter.');
      if (f.field === 'client_id') f.values.forEach(validateClientId);
    }
  }
  if (query.sort !== undefined) {
    exactKeys(query.sort, ['field', 'direction', 'unit']);
    if (
      !['USED', 'PERIOD_START'].includes(query.sort.field) ||
      !['ASC', 'DESC'].includes(query.sort.direction ?? 'ASC') ||
      (query.sort.field === 'PERIOD_START' &&
        (granularity === 'NONE' || 'unit' in query.sort)) ||
      ('unit' in query.sort && !['USD', 'CREDITS'].includes(query.sort.unit))
    )
      throw new ApiError('Invalid sort.');
  }
  return query;
}
export function validateEvaluation(query) {
  exactKeys(query, ['target', 'usage_selector']);
  validateTarget(query.target);
  exactKeys(query.usage_selector, ['client_id', 'period']);
  validateClientId(query.usage_selector.client_id);
  exactKeys(query.usage_selector.period, ['type']);
  if (query.usage_selector.period.type !== PERIOD.type)
    throw new ApiError('Only current calendar-month evaluation is supported.');
}
export function parsePage(page) {
  if (
    !object(page) ||
    !Array.isArray(page.results) ||
    typeof page.has_more !== 'boolean' ||
    !nonblank(page.request_id) ||
    (page.has_more && !nonblank(page.next_cursor))
  )
    throw new ApiError(
      'Malformed upstream pagination envelope.',
      502,
      'invalid_response',
    );
  return page;
}
export function parseSearchResponse(response) {
  parsePage(response);
  if (
    !Array.isArray(response.totals) ||
    !object(response.time_range) ||
    !('data_updated_at' in response) ||
    !('earliest_available_at' in response)
  )
    throw new ApiError(
      'Malformed measured-usage response.',
      502,
      'invalid_response',
    );
  const amounts = (a) =>
    Array.isArray(a) &&
    a.every(
      (v) =>
        object(v) &&
        ['USD', 'CREDITS'].includes(v.unit) &&
        typeof v.used === 'string' &&
        /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u.test(v.used),
    );
  if (
    !amounts(response.totals) ||
    response.results.some(
      (b) => !object(b.dimensions) || !amounts(b.used_by_unit),
    )
  )
    throw new ApiError(
      'Malformed measured-usage amounts.',
      502,
      'invalid_response',
    );
  return response;
}
// Integer micro-units keep ledger arithmetic separate from rounded chart geometry.
export function micros(decimal) {
  if (
    typeof decimal !== 'string' ||
    !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u.test(decimal)
  )
    throw new ApiError('Invalid decimal amount.');
  const [whole, fraction = ''] = decimal.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function decimal(value) {
  const whole = value / 1000000n;
  const fraction = (value % 1000000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/u, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
export function buildOrgTree(users) {
  const ids = new Set(users.map((u) => u.user_id));
  const children = new Map();
  const byId = new Map(users.map((u) => [u.user_id, u]));
  for (const user of users) {
    let parent = user.manager?.user_id;
    const seen = new Set([user.user_id]);
    let cursor = parent;
    let cycle = false;
    while (cursor && ids.has(cursor)) {
      if (seen.has(cursor)) {
        cycle = true;
        break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor).manager?.user_id;
    }
    if (cycle || !ids.has(parent)) parent = null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(user);
  }
  const node = (user) => ({
    user,
    children: (children.get(user.user_id) ?? []).map(node),
  });
  return (children.get(null) ?? []).map(node);
}
