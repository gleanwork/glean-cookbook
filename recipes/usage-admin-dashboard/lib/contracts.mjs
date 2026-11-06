// Request and response contracts for the usage operations that the released
// SDK does not cover yet. Fields are traced in docs/API-COVERAGE.md.
export const PERIOD = { type: 'RECURRING_CALENDAR_MONTH' };
// Reserved key of the workspace premium-model policy (DEFAULT_USER only). It is
// not a cross-client budget, so it is never a writable or evaluable client.
export const PREMIUM_POLICY_CLIENT = '*';
export const LIMIT_TARGETS = Object.freeze([
  'ORGANIZATION',
  'DEFAULT_USER',
  'USER',
]);
export const EVALUATION_TARGETS = Object.freeze(['ORGANIZATION', 'USER']);
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
    id === '__deleted_clients__' ||
    id === PREMIUM_POLICY_CLIENT
  )
    throw new ApiError('Choose a valid opaque spend-client ID.');
  return id; // Intentionally never trim, prefix, or normalize an ID.
}
export function validateTarget(target, types) {
  exactKeys(target, ['type', 'client_id', 'user_id']);
  if (!types.includes(target.type))
    throw new ApiError(
      `This operation accepts ${types.join(', ')} targets.`,
      422,
      'unsupported_target',
    );
  validateClientId(target.client_id);
  if (target.type === 'USER' ? !nonblank(target.user_id) : 'user_id' in target)
    throw new ApiError(
      'A USER requires a canonical user_id; other targets must omit it.',
    );
  return target;
}
function validatePeriod(period) {
  exactKeys(period, ['type']);
  if (period.type !== PERIOD.type)
    throw new ApiError('Only recurring calendar-month limits are supported.');
}
// The natural key that identifies one configured policy for reset.
export function validateLimitKey(key) {
  exactKeys(key, ['target', 'period']);
  validateTarget(key.target, LIMIT_TARGETS);
  validatePeriod(key.period);
  return key;
}
export function limitKey(limit) {
  const { type, client_id, user_id } = limit.target;
  return {
    target: { type, client_id, ...(type === 'USER' ? { user_id } : {}) },
    period: { type: limit.period.type },
  };
}
// Writes omit actions, which preserves thresholds configured elsewhere
// (for example NOTIFY in the Admin console); an empty list would clear them.
export function validateLimit(limit) {
  exactKeys(limit, ['target', 'period', 'value', 'allocation_mode']);
  validateTarget(limit.target, LIMIT_TARGETS);
  validatePeriod(limit.period);
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
    target:
      type === 'USER'
        ? { type, client_id: clientId, user_id: userId }
        : { type, client_id: clientId },
    period: { ...PERIOD },
    value: unlimited
      ? { mode: 'UNLIMITED' }
      : { mode: 'FINITE', amount, unit, enforcement },
  };
  if (type === 'ORGANIZATION') limit.allocation_mode = 'SHARED_POOL';
  if (type === 'DEFAULT_USER') limit.allocation_mode = 'PER_MEMBER';
  return validateLimit(limit);
}
export function validateEvaluation(query) {
  exactKeys(query, ['target', 'period']);
  validateTarget(query.target, EVALUATION_TARGETS);
  validatePeriod(query.period);
  return query;
}
export function parseEvaluation(r) {
  if (
    !object(r) ||
    !object(r.target) ||
    !object(r.period) ||
    !Array.isArray(r.restrictions) ||
    !Number.isInteger(r.applicable_policy_count) ||
    !nonblank(r.decision) ||
    !Array.isArray(r.decision_causes) ||
    !Array.isArray(r.effective_limits) ||
    r.effective_limits.length < 1 ||
    !Array.isArray(r.evaluated_limits) ||
    r.evaluated_limits.some(
      (l) =>
        !object(l.target) ||
        !object(l.value) ||
        typeof l.used !== 'string' ||
        !Array.isArray(l.active_actions),
    ) ||
    !nonblank(r.evaluated_at)
  )
    throw new ApiError('Malformed limit evaluation.', 502, 'invalid_response');
  return r;
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
// Integer micro-units keep sample ledger arithmetic exact.
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
