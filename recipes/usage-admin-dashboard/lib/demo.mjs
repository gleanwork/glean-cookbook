import {
  ApiError,
  PERIOD,
  PREMIUM_POLICY_CLIENT,
  makeLimit,
  micros,
  decimal,
  validateEvaluation,
  validateLimit,
  validateLimitKey,
} from './contracts.mjs';
export const USERS = [
  {
    user_id: 'demo-alex',
    display_name: 'Alex Morgan',
    email: 'alex@example.test',
    title: 'CEO',
    department: { department_id: 'dep-exec', display_name: 'Leadership' },
  },
  {
    user_id: 'demo-jordan',
    display_name: 'Jordan Lee',
    email: 'jordan@example.test',
    title: 'VP Engineering',
    department: { department_id: 'dep-eng', display_name: 'Engineering' },
    manager: { user_id: 'demo-alex', display_name: 'Alex Morgan' },
  },
  {
    user_id: 'demo-sam',
    display_name: 'Sam Rivera',
    email: 'sam@example.test',
    title: 'Platform Engineer',
    department: { department_id: 'dep-eng', display_name: 'Engineering' },
    manager: { user_id: 'demo-jordan', display_name: 'Jordan Lee' },
  },
  {
    user_id: 'demo-casey',
    display_name: 'Casey Patel',
    email: 'casey@example.test',
    title: 'Staff Engineer',
    department: { department_id: 'dep-eng', display_name: 'Engineering' },
    manager: { user_id: 'demo-jordan', display_name: 'Jordan Lee' },
  },
  {
    user_id: 'demo-taylor',
    display_name: 'Taylor Chen',
    email: 'taylor@example.test',
    title: 'Head of Sales',
    department: { department_id: 'dep-sales', display_name: 'Sales' },
    manager: { user_id: 'demo-alex', display_name: 'Alex Morgan' },
  },
  {
    user_id: 'demo-riley',
    display_name: 'Riley Brooks',
    email: 'riley@example.test',
    title: 'Account Executive',
    department: { department_id: 'dep-sales', display_name: 'Sales' },
    manager: { user_id: 'demo-taylor', display_name: 'Taylor Chen' },
  },
];
export const CLIENTS = [
  {
    display_name: 'Engineering copilot',
    usage_client_id: 'demo-gateway-eng',
    oauth_client_id: 'demo-oauth-eng',
  },
  {
    display_name: 'Customer support',
    usage_client_id: 'demo-gateway-support',
    oauth_client_id: 'demo-oauth-support',
  },
];
const copy = (v) => structuredClone(v);
const key = ({ target }) =>
  JSON.stringify([target.type, target.user_id ?? null, target.client_id]);
const withActions = (limit, actions) => ({ ...limit, actions });
export function createDemoProvider({
  now = () => new Date(),
  pageSize = 3,
} = {}) {
  const limits = [
    withActions(
      makeLimit({
        type: 'ORGANIZATION',
        clientId: 'glean',
        amount: '12000',
        unit: 'CREDITS',
      }),
      [{ type: 'NOTIFY', at_percent: 80 }],
    ),
    withActions(
      makeLimit({
        type: 'DEFAULT_USER',
        clientId: 'glean',
        amount: '400',
        unit: 'CREDITS',
        enforcement: 'SOFT',
      }),
      [{ type: 'NOTIFY', at_percent: 90 }],
    ),
    makeLimit({
      type: 'USER',
      userId: 'demo-sam',
      clientId: 'glean',
      amount: '600',
      unit: 'CREDITS',
    }),
    {
      target: { type: 'DEFAULT_USER', client_id: PREMIUM_POLICY_CLIENT },
      period: { ...PERIOD },
      actions: [
        {
          type: 'RESTRICT_MODELS',
          at_percent: 50,
          allow: { models: ['demo-standard-model'] },
        },
      ],
    },
  ];
  const premium = () =>
    limits.find((l) => l.target.client_id === PREMIUM_POLICY_CLIENT)
      ?.actions[0];
  const SAMPLE_CLIENTS = new Set([
    'glean',
    ...CLIENTS.map((c) => c.usage_client_id),
  ]);
  // Fictional consumption in integer micro-units of the client's billing unit.
  // Some days have no observations, like a real ledger.
  function sampleUsed({ userId, clientId, start, end }) {
    if (!SAMPLE_CLIENTS.has(clientId)) return 0n;
    const scale = clientId === 'glean' ? 1000000 : 10000;
    let total = 0n;
    const observedEnd = Math.min(end, +now());
    for (let t = start, day = 0; t < observedEnd; t += 86400000, day++) {
      if (day % 9 === 7) continue;
      USERS.forEach((user, i) => {
        if (!userId || user.user_id === userId)
          total += BigInt((19 + i * 13 + (day % 5) * 7) * scale);
      });
    }
    return total;
  }
  const envelope = (results) => ({
    results: copy(results),
    has_more: false,
    next_cursor: null,
    request_id: 'demo-request',
  });
  return {
    mode: 'demo',
    writes: true,
    async catalog(kind, cursor) {
      const catalogs = {
        users: USERS,
        departments: [
          ...new Map(
            USERS.map((u) => [u.department.department_id, { ...u.department }]),
          ).values(),
        ],
        clients: CLIENTS,
      };
      if (!catalogs[kind]) throw new ApiError('Unknown catalog.');
      const n = cursor ? Number(cursor.replace('demo-page-', '')) : 0;
      if (
        !Number.isInteger(n) ||
        n < 0 ||
        (cursor && cursor !== `demo-page-${n}`)
      )
        throw new ApiError('Invalid demo cursor.');
      const result = envelope(catalogs[kind].slice(n, n + pageSize));
      result.has_more = n + pageSize < catalogs[kind].length;
      result.next_cursor = result.has_more ? `demo-page-${n + pageSize}` : null;
      return result;
    },
    async limits() {
      return envelope(limits);
    },
    async save(limit) {
      validateLimit(limit);
      const denomination =
        limit.target.client_id === 'glean' ? 'CREDITS' : 'USD';
      if (
        SAMPLE_CLIENTS.has(limit.target.client_id) &&
        limit.value.mode === 'FINITE' &&
        limit.value.unit !== denomination
      )
        throw new ApiError(
          'Sample client billing denomination does not match the selected unit.',
        );
      const index = limits.findIndex((l) => key(l) === key(limit));
      const stored = copy(limit);
      if (index === -1) limits.push(stored);
      else {
        if (limits[index].actions) stored.actions = limits[index].actions;
        limits[index] = stored;
      }
      return { usage_limit: copy(stored), request_id: 'demo-save' };
    },
    async reset(limitKey) {
      validateLimitKey(limitKey);
      const index = limits.findIndex((l) => key(l) === key(limitKey));
      if (index !== -1) limits.splice(index, 1);
      return {
        is_configuration_removed: index !== -1,
        request_id: 'demo-reset',
      };
    },
    async evaluate(body) {
      validateEvaluation(body);
      const target = body.target;
      const client = target.client_id;
      const timestamp = now();
      const start = new Date(
        Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), 1),
      )
        .toISOString()
        .replace('.000Z', 'Z');
      const end = new Date(
        Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth() + 1, 1),
      )
        .toISOString()
        .replace('.000Z', 'Z');
      const counter = (type) =>
        sampleUsed({
          userId: type === 'USER' ? target.user_id : undefined,
          clientId: client,
          start: Date.parse(start),
          end: Date.parse(end),
        });
      const clientLimits = limits.filter((l) => l.target.client_id === client);
      const personal =
        target.type === 'USER'
          ? (clientLimits.find(
              (l) =>
                l.target.type === 'USER' && l.target.user_id === target.user_id,
            ) ?? clientLimits.find((l) => l.target.type === 'DEFAULT_USER'))
          : undefined;
      const matching = [
        ...clientLimits.filter((l) => l.target.type === 'ORGANIZATION'),
        ...(personal ? [personal] : []),
      ];
      const restrictions = [];
      const causes = new Map();
      const evaluated = matching.map((l) => {
        const used = counter(
          l.target.type === 'ORGANIZATION' ? 'ORGANIZATION' : 'USER',
        );
        const finite = l.value.mode === 'FINITE';
        const cap = finite ? micros(l.value.amount) : 0n;
        const percent =
          finite && cap > 0n ? Number((used * 10000n) / cap) / 100 : 0;
        const actions = copy(l.actions ?? []);
        if (l === personal && premium())
          actions.push({
            ...copy(premium()),
            inherited_from: {
              type: 'DEFAULT_USER',
              client_id: PREMIUM_POLICY_CLIENT,
            },
          });
        if (finite && l.value.enforcement === 'HARD')
          actions.push({ type: 'BLOCK', at_percent: 100 });
        const reached = finite && used >= cap;
        const decision = reached
          ? l.value.enforcement === 'HARD'
            ? 'BLOCKED'
            : 'WARNING'
          : 'AVAILABLE';
        const active = finite
          ? actions.filter((a) => a.at_percent <= percent)
          : [];
        const next = finite
          ? actions
              .filter((a) => a.at_percent > percent)
              .sort((a, b) => a.at_percent - b.at_percent)[0]
          : undefined;
        for (const a of active)
          if (a.type === 'RESTRICT_MODELS')
            restrictions.push({
              type: a.type,
              allow: copy(a.allow),
              source: copy(a.inherited_from),
            });
        if (decision !== 'AVAILABLE') {
          const cause = {
            decision,
            budget_scope:
              l.target.type === 'ORGANIZATION' && target.type !== 'ORGANIZATION'
                ? 'SHARED'
                : 'TARGET',
            source_type: l.target.type,
          };
          causes.set(JSON.stringify(cause), cause);
        }
        const { type, client_id, user_id } = l.target;
        const email = USERS.find((u) => u.user_id === user_id)?.email;
        return {
          target: {
            type,
            client_id,
            ...(user_id ? { user_id, ...(email ? { email } : {}) } : {}),
          },
          period: { ...PERIOD },
          value: copy(l.value),
          used: decimal(used),
          decision,
          active_actions: active.filter((a) => a.type !== 'BLOCK'),
          ...(next ? { next_action: next } : {}),
          headroom: finite ? (cap > used ? cap - used : 0n) : undefined,
        };
      });
      const tightest = evaluated
        .filter((l) => l.headroom !== undefined)
        .sort((a, b) =>
          a.headroom < b.headroom ? -1 : a.headroom > b.headroom ? 1 : 0,
        )[0];
      const decision = evaluated.some((l) => l.decision === 'BLOCKED')
        ? 'BLOCKED'
        : evaluated.some((l) => l.decision === 'WARNING')
          ? 'WARNING'
          : 'AVAILABLE';
      return {
        target: copy(target),
        period: { ...PERIOD },
        restrictions,
        applicable_policy_count: evaluated.length,
        decision,
        decision_causes: [...causes.values()].sort((a, b) =>
          a.decision === b.decision ? 0 : a.decision === 'BLOCKED' ? -1 : 1,
        ),
        effective_limits: tightest
          ? [
              {
                mode: 'FINITE',
                remaining: decimal(tightest.headroom),
                unit: tightest.value.unit,
                enforcement: tightest.value.enforcement,
              },
            ]
          : [{ mode: 'UNLIMITED' }],
        evaluated_limits: evaluated.map(({ headroom, ...l }) => l),
        evaluated_at: timestamp.toISOString(),
        request_id: 'demo-evaluation',
      };
    },
  };
}
