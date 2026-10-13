import { randomUUID } from 'node:crypto';
import {
  ApiError,
  PERIOD,
  makeLimit,
  micros,
  decimal,
  validateLimit,
  validateSearch,
  validateEvaluation,
} from './contracts.mjs';
export const USERS = [
  {
    user_id: 'demo-alex',
    display_name: 'Alex Morgan',
    email: 'alex@example.test',
    is_active: true,
    title: 'CEO',
    department: { department_id: 'dep-exec', display_name: 'Leadership' },
  },
  {
    user_id: 'demo-jordan',
    display_name: 'Jordan Lee',
    email: 'jordan@example.test',
    is_active: true,
    title: 'VP Engineering',
    department: { department_id: 'dep-eng', display_name: 'Engineering' },
    manager: { user_id: 'demo-alex', display_name: 'Alex Morgan' },
  },
  {
    user_id: 'demo-sam',
    display_name: 'Sam Rivera',
    email: 'sam@example.test',
    is_active: true,
    title: 'Platform Engineer',
    department: { department_id: 'dep-eng', display_name: 'Engineering' },
    manager: { user_id: 'demo-jordan', display_name: 'Jordan Lee' },
  },
  {
    user_id: 'demo-casey',
    display_name: 'Casey Patel',
    email: 'casey@example.test',
    is_active: true,
    title: 'Staff Engineer',
    department: { department_id: 'dep-eng', display_name: 'Engineering' },
    manager: { user_id: 'demo-jordan', display_name: 'Jordan Lee' },
  },
  {
    user_id: 'demo-taylor',
    display_name: 'Taylor Chen',
    email: 'taylor@example.test',
    is_active: true,
    title: 'Head of Sales',
    department: { department_id: 'dep-sales', display_name: 'Sales' },
    manager: { user_id: 'demo-alex', display_name: 'Alex Morgan' },
  },
  {
    user_id: 'demo-riley',
    display_name: 'Riley Brooks',
    email: 'riley@example.test',
    is_active: true,
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
const MODEL_LABELS = {
  'demo-standard-model': 'Standard model · sample',
  'demo-premium-model': 'Premium model · sample',
};
const copy = (v) => structuredClone(v);
const key = (limit) =>
  JSON.stringify([
    limit.target.type,
    limit.target.user_id ?? null,
    limit.usage_selector.client_id,
  ]);
export function createDemoProvider({
  now = () => new Date(),
  pageSize = 3,
} = {}) {
  const limits = [
    makeLimit({
      type: 'ORGANIZATION',
      clientId: 'glean',
      amount: '12000',
      unit: 'CREDITS',
    }),
    makeLimit({
      type: 'DEFAULT_USER',
      clientId: 'glean',
      amount: '400',
      unit: 'CREDITS',
      enforcement: 'SOFT',
    }),
    makeLimit({
      type: 'USER',
      userId: 'demo-sam',
      clientId: 'glean',
      amount: '600',
      unit: 'CREDITS',
    }),
  ];
  const cursors = new Map();
  const fingerprint = (query) =>
    JSON.stringify({ ...query, cursor: undefined });
  function pageSnapshot(snapshot, query, offset) {
    const size = query.page_size ?? 100;
    const results = copy(snapshot.results.slice(offset, offset + size));
    const has_more = offset + size < snapshot.results.length;
    let next_cursor = null;
    if (has_more) {
      next_cursor = randomUUID();
      if (cursors.size >= 100) cursors.delete(cursors.keys().next().value);
      cursors.set(next_cursor, {
        snapshot,
        fingerprint: fingerprint(query),
        offset: offset + size,
        expires: +now() + 86400000,
      });
    }
    const labels = {};
    if (query.include?.includes('DISPLAY_NAMES'))
      for (const bucket of results)
        for (const [field, id] of Object.entries(bucket.dimensions)) {
          const label = snapshot.labels?.[field]?.[id];
          if (id !== null && label) {
            labels[field] ??= {};
            labels[field][id] = copy(label);
          }
        }
    return { ...copy(snapshot), results, labels, has_more, next_cursor };
  }
  function rows(query) {
    const start = Date.parse(query.time_range.start),
      end = Date.parse(query.time_range.end);
    const rows = [];
    // Omit unobserved days; the UI must not turn gaps into verified zero.
    const observedEnd = Math.min(end, +now());
    for (let t = start, day = 0; t < observedEnd; t += 86400000, day++) {
      if (day % 9 === 7) continue;
      USERS.forEach((user, i) => {
        for (const client of [
          'glean',
          'demo-gateway-eng',
          'demo-gateway-support',
        ]) {
          const unit = client === 'glean' ? 'CREDITS' : 'USD';
          rows.push({
            at: t,
            user_id: user.user_id,
            client_id: client,
            model_id:
              i === 5
                ? null
                : (day + i) % 3
                  ? 'demo-standard-model'
                  : 'demo-premium-model',
            product:
              client === 'glean'
                ? ['ASSISTANT', 'AGENT', 'MCP'][i % 3]
                : 'AI_GATEWAY',
            feature: 'ASSISTANT',
            agent_id: null,
            unit,
            used: BigInt(
              (19 + i * 13 + (day % 5) * 7) *
                (unit === 'USD' ? 10000 : 1000000),
            ),
          });
        }
      });
    }
    return rows.filter(
      (r) =>
        (query.target.type === 'ORGANIZATION' ||
          r.user_id === query.target.user_id) &&
        (query.filters ?? []).every(
          (f) =>
            (f.operator === 'NOT_EQUALS') !== f.values.includes(r[f.field]),
        ),
    );
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
            USERS.map((u) => [
              u.department.department_id,
              { ...u.department, is_active: true },
            ]),
          ).values(),
        ],
        clients: CLIENTS,
        groups: [
          {
            idp_group_id: 'demo-group-eng',
            display_name: 'Engineering (sample IdP group)',
            is_active: true,
          },
        ],
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
        limit.usage_selector.client_id === 'glean' ? 'CREDITS' : 'USD';
      if (limit.value.mode === 'FINITE' && limit.value.unit !== denomination)
        throw new ApiError(
          'Sample client billing denomination does not match the selected unit.',
        );
      const index = limits.findIndex((l) => key(l) === key(limit));
      if (index === -1) limits.push(copy(limit));
      else limits[index] = copy(limit);
      return { results: [copy(limit)], request_id: 'demo-save' };
    },
    async search(query) {
      validateSearch(query);
      if (query.cursor) {
        const retained = cursors.get(query.cursor);
        if (!retained || retained.expires < +now())
          throw new ApiError(
            'Sample snapshot cursor expired; start a fresh query.',
            400,
            'expired_cursor',
          );
        if (retained.fingerprint !== fingerprint(query))
          throw new ApiError(
            'Cursor is bound to the original query and page size.',
            400,
            'invalid_cursor',
          );
        return pageSnapshot(retained.snapshot, query, retained.offset);
      }
      const source = rows(query);
      const groups = query.group_by ?? [];
      const granularity = query.granularity ?? 'NONE';
      const totals = new Map();
      const buckets = new Map();
      for (const r of source) {
        totals.set(r.unit, (totals.get(r.unit) ?? 0n) + r.used);
        const dimensions = Object.fromEntries(
          groups.map((g) => {
            const f = {
              MODEL: 'model_id',
              CLIENT: 'client_id',
              USER: 'user_id',
              AGENT: 'agent_id',
              PRODUCT: 'product',
              FEATURE: 'feature',
            }[g];
            return [f, r[f]];
          }),
        );
        let period;
        if (granularity !== 'NONE') {
          const date = new Date(r.at);
          if (granularity === 'MONTH') date.setUTCDate(1);
          if (granularity === 'WEEK')
            date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
          const finish = new Date(date);
          if (granularity === 'MONTH')
            finish.setUTCMonth(finish.getUTCMonth() + 1);
          else
            finish.setUTCDate(
              finish.getUTCDate() + (granularity === 'DAY' ? 1 : 7),
            );
          period = {
            start: new Date(Math.max(+date, Date.parse(query.time_range.start)))
              .toISOString()
              .replace('.000Z', 'Z'),
            end: new Date(Math.min(+finish, Date.parse(query.time_range.end)))
              .toISOString()
              .replace('.000Z', 'Z'),
          };
        }
        const k = JSON.stringify([dimensions, period]);
        if (!buckets.has(k))
          buckets.set(k, {
            dimensions,
            ...(period ? { period } : {}),
            amounts: new Map(),
          });
        const b = buckets.get(k);
        b.amounts.set(r.unit, (b.amounts.get(r.unit) ?? 0n) + r.used);
      }
      const amounts = (m) =>
        ['USD', 'CREDITS']
          .filter((u) => m.has(u))
          .map((unit) => ({ unit, used: decimal(m.get(unit)) }));
      const results = [...buckets.values()].map(({ amounts: a, ...b }) => ({
        ...b,
        used_by_unit: amounts(a),
      }));
      const field =
        query.sort?.field ?? (granularity === 'NONE' ? 'USED' : 'PERIOD_START');
      const direction =
        query.sort?.direction ?? (granularity === 'NONE' ? 'DESC' : 'ASC');
      results.sort((a, b) => {
        let comparison = 0;
        if (field === 'PERIOD_START')
          comparison = a.period.start.localeCompare(b.period.start);
        else
          for (const unit of query.sort?.unit
            ? [query.sort.unit]
            : ['USD', 'CREDITS']) {
            const aa = a.used_by_unit.find((x) => x.unit === unit),
              bb = b.used_by_unit.find((x) => x.unit === unit);
            if (!!aa !== !!bb) return aa ? -1 : 1; // Missing units are last in either direction.
            if (aa && bb) {
              const diff = micros(aa.used) - micros(bb.used);
              comparison = diff < 0n ? -1 : diff > 0n ? 1 : 0;
              if (comparison) break;
            }
          }
        if (comparison) return comparison * (direction === 'DESC' ? -1 : 1);
        for (const dimension of Object.keys(a.dimensions).sort()) {
          const aa = a.dimensions[dimension],
            bb = b.dimensions[dimension];
          if (aa === null && bb !== null) return -1;
          if (bb === null && aa !== null) return 1;
          const tie = (aa ?? '').localeCompare(bb ?? '');
          if (tie) return tie;
        }
        return (a.period?.start ?? '').localeCompare(b.period?.start ?? '');
      });
      const snapshot = {
        target: copy(query.target),
        results,
        totals: amounts(totals),
        time_range: copy(query.time_range),
        data_updated_at: null,
        earliest_available_at: null,
        has_more: false,
        next_cursor: null,
        request_id: 'demo-search',
        labels: {
          user_id: Object.fromEntries(
            USERS.map((u) => [
              u.user_id,
              { display_name: u.display_name, email: u.email },
            ]),
          ),
          client_id: {
            glean: { display_name: 'Glean' },
            ...Object.fromEntries(
              CLIENTS.map((c) => [
                c.usage_client_id,
                { display_name: c.display_name },
              ]),
            ),
          },
          model_id: Object.fromEntries(
            Object.entries(MODEL_LABELS).map(([id, display_name]) => [
              id,
              { display_name },
            ]),
          ),
        },
      };
      return pageSnapshot(snapshot, query, 0);
    },
    async evaluate(query) {
      validateEvaluation(query);
      const client = query.usage_selector.client_id;
      const unit = client === 'glean' ? 'CREDITS' : 'USD';
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
      const source = rows({
        ...query,
        time_range: { start, end },
        filters: [{ field: 'client_id', values: [client] }],
      });
      const sum = (rs) => decimal(rs.reduce((total, r) => total + r.used, 0n));
      const used = sum(source);
      const clientLimits = limits.filter(
        (l) => l.usage_selector.client_id === client,
      );
      const personal =
        query.target.type === 'USER'
          ? (clientLimits.find(
              (l) =>
                l.target.type === 'USER' &&
                l.target.user_id === query.target.user_id,
            ) ?? clientLimits.find((l) => l.target.type === 'DEFAULT_USER'))
          : undefined;
      const matching = [
        ...clientLimits.filter((l) => l.target.type === 'ORGANIZATION'),
        ...(personal ? [personal] : []),
      ];
      const evaluated = matching.map((l) => {
        const counter =
          l.target.type === 'ORGANIZATION'
            ? sum(
                rows({
                  target: { type: 'ORGANIZATION' },
                  time_range: { start, end },
                  filters: [{ field: 'client_id', values: [client] }],
                }),
              )
            : used;
        const remaining =
          l.value.mode === 'FINITE'
            ? decimal(
                micros(l.value.amount) > micros(counter)
                  ? micros(l.value.amount) - micros(counter)
                  : 0n,
              )
            : undefined;
        return {
          target: copy(l.target),
          usage_selector: copy(l.usage_selector),
          value: copy(l.value),
          used: counter,
          ...(remaining === undefined ? {} : { remaining }),
          decision:
            remaining === '0'
              ? l.value.enforcement === 'HARD'
                ? 'BLOCKED'
                : 'WARNING'
              : 'AVAILABLE',
        };
      });
      const finite = evaluated.filter((l) => l.value.mode === 'FINITE');
      const tightest = finite.sort((a, b) =>
        Number(micros(a.remaining) - micros(b.remaining)),
      )[0];
      return {
        target: copy(query.target),
        usage_selector: copy(query.usage_selector),
        applicable_policy_count: evaluated.length,
        used_by_unit: [{ unit, used }],
        decision: evaluated.some((l) => l.decision === 'BLOCKED')
          ? 'BLOCKED'
          : evaluated.some((l) => l.decision === 'WARNING')
            ? 'WARNING'
            : 'AVAILABLE',
        effective_limits: tightest
          ? [
              {
                mode: 'FINITE',
                remaining: tightest.remaining,
                unit: tightest.value.unit,
                enforcement: tightest.value.enforcement,
              },
            ]
          : [{ mode: 'UNLIMITED' }],
        evaluated_limits: evaluated,
        evaluated_at: timestamp.toISOString(),
        request_id: 'demo-evaluation',
      };
    },
  };
}
