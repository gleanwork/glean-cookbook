import { makeLimit, PERIOD, buildOrgTree } from '/contracts.mjs';
const $ = (id) => document.getElementById(id);
const state = {
  users: [],
  departments: [],
  clients: [],
  groups: [],
  limits: [],
  caps: {},
  model: null,
  labKind: 'search',
  labQuery: null,
  labCursor: null,
  reviewed: null,
  usageRun: 0,
  evalRun: 0,
};
const fmt = (v) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const option = (value, name) => {
  const e = el('option', name);
  e.value = value;
  return e;
};
async function api(path, body) {
  const res = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Recipe-Request': '1',
          },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `${data.message} [${data.code}${data.request_id ? ` · ${data.request_id}` : ''}]`,
    );
  return data;
}
function show(view) {
  document.querySelectorAll('.view').forEach((e) => (e.hidden = e.id !== view));
  document.querySelectorAll('[data-view]').forEach((e) => {
    if (e.dataset.view === view) e.setAttribute('aria-current', 'page');
    else e.removeAttribute('aria-current');
  });
  $('report-filters').hidden = view !== 'overview' && view !== 'lab';
}
function query(groupBy = [], granularity = 'DAY', withModel = true) {
  const filters = [];
  if ($('client').value)
    filters.push({ field: 'client_id', values: [$('client').value] });
  if (state.model && withModel)
    filters.push({ field: 'model_id', values: [state.model] });
  return {
    target: { type: 'ORGANIZATION' },
    time_range: {
      start: `${$('start').value}T00:00:00Z`,
      end: `${$('end').value}T00:00:00Z`,
    },
    granularity,
    group_by: groupBy,
    filters,
    include: ['DISPLAY_NAMES'],
    page_size: 1000,
  };
}
async function allUsage(q) {
  const pages = [];
  const seen = new Set();
  let cursor;
  for (let i = 0; i < 25; i++) {
    const p = await api('/api/usage/search', {
      ...q,
      ...(cursor ? { cursor } : {}),
    });
    pages.push(p);
    if (!p.has_more)
      return {
        ...pages[0],
        results: pages.flatMap((p) => p.results),
        labels: pages.reduce((out, p) => {
          for (const [field, labels] of Object.entries(p.labels ?? {}))
            out[field] = { ...out[field], ...labels };
          return out;
        }, {}),
      };
    if (!p.next_cursor || seen.has(p.next_cursor))
      throw new Error(
        'Invalid repeated/missing cursor; no partial chart is shown.',
      );
    seen.add(p.next_cursor);
    cursor = p.next_cursor;
  }
  throw new Error(
    'More than 25 pages; narrow the interval or filters. No partial chart is shown.',
  );
}
function table(headers, rows) {
  const t = el('table'),
    head = el('thead'),
    tr = el('tr');
  headers.forEach((h) => {
    const th = el('th', h);
    th.scope = 'col';
    tr.append(th);
  });
  head.append(tr);
  t.append(head);
  const body = el('tbody');
  rows.forEach((cells) => {
    const tr = el('tr');
    cells.forEach((c) => {
      const td = el('td');
      td.append(c instanceof Node ? c : document.createTextNode(c));
      tr.append(td);
    });
    body.append(tr);
  });
  t.append(body);
  return t;
}
function svg(tag, attrs, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function drawTrend(result) {
  const unit = $('unit').value;
  $('chart-unit').textContent = `${unit} · daily`;
  const observed = result.results.filter((b) =>
    b.used_by_unit.some((a) => a.unit === unit),
  );
  if (!observed.length) {
    $('trend').replaceChildren(
      el(
        'p',
        'No observed amounts for this unit in the selected interval. This does not verify zero usage.',
        'muted',
      ),
    );
    $('trend-data').replaceChildren();
    return;
  }
  const amounts = observed.map((b) =>
    Number(b.used_by_unit.find((a) => a.unit === unit).used),
  );
  const max = Math.max(...amounts, 1);
  const w = 660,
    h = 210,
    top = 16,
    bottom = 175;
  const firstDay = Date.parse(observed[0].period.start);
  const lastDay = Date.parse(observed.at(-1).period.start);
  const gap = (w - 60) / ((lastDay - firstDay) / 86400000 + 1);
  const chart = svg('svg', {
    viewBox: `0 0 ${w} ${h}`,
    role: 'img',
    'aria-label': `Observed daily usage in ${unit}. Missing days are not verified zero; exact values follow in the data table.`,
  });
  chart.append(
    svg('line', { x1: 40, x2: w, y1: bottom, y2: bottom }),
    svg('text', { x: 0, y: top + 8 }, fmt(max)),
    svg('text', { x: 16, y: bottom + 4 }, '0'),
  );
  observed.forEach((b, i) => {
    const x = 48 + ((Date.parse(b.period.start) - firstDay) / 86400000) * gap;
    const height = (amounts[i] / max) * (bottom - top);
    const bar = svg('rect', {
      x,
      y: bottom - height,
      width: Math.max(1, gap - 3),
      height: Math.max(height, 1),
      rx: 2,
    });
    bar.append(
      svg(
        'title',
        {},
        `${b.period.start.slice(0, 10)}: ${b.used_by_unit.find((a) => a.unit === unit).used} ${unit}`,
      ),
    );
    chart.append(bar);
    if (i % Math.max(1, Math.ceil(observed.length / 4)) === 0)
      chart.append(svg('text', { x, y: 203 }, b.period.start.slice(5, 10)));
  });
  $('trend').replaceChildren(chart);
  $('trend-data').replaceChildren(
    table(
      ['UTC day', `Observed ${unit}`],
      observed.map((b) => [
        b.period.start.slice(0, 10),
        b.used_by_unit.find((a) => a.unit === unit).used,
      ]),
    ),
  );
}
async function refreshUsage() {
  const run = ++state.usageRun;
  $('refresh').disabled = true;
  $('trend').replaceChildren(el('p', 'Loading observed usage…'));
  $('model-breakdown').replaceChildren();
  $('credits').textContent = '—';
  $('usd').textContent = '—';
  $('trend-data').replaceChildren();
  $('freshness').textContent = '';
  try {
    const [trend, models] = await Promise.all([
      allUsage(query()),
      allUsage(query(['MODEL'], 'NONE', false)),
    ]);
    if (run !== state.usageRun) return;
    $('credits').textContent = trend.totals.some((a) => a.unit === 'CREDITS')
      ? fmt(trend.totals.find((a) => a.unit === 'CREDITS').used)
      : 'Not observed';
    $('usd').textContent = trend.totals.some((a) => a.unit === 'USD')
      ? `$${fmt(trend.totals.find((a) => a.unit === 'USD').used)}`
      : 'Not observed';
    drawTrend(trend);
    $('freshness').textContent =
      `Stored observations · ${trend.data_updated_at ? `source updated ${trend.data_updated_at}` : 'source freshness unknown'} · ${trend.earliest_available_at ? `coverage starts ${trend.earliest_available_at}` : 'historical coverage unknown'}. Missing buckets do not prove zero. ${state.model ? 'Model filter active.' : ''}`;
    $('clear-model').hidden = !state.model;
    for (const row of models.results) {
      const id = row.dimensions.model_id;
      const b = el('button', undefined, 'model-row');
      const name =
        id === null
          ? 'Unattributed model'
          : (models.labels?.model_id?.[id]?.display_name ?? id);
      b.append(
        el('span', name),
        el(
          'span',
          row.used_by_unit.map((v) => `${fmt(v.used)} ${v.unit}`).join(' · '),
        ),
      );
      b.disabled = id === null;
      b.title =
        id === null
          ? 'Null attribution cannot be selected by the API filter.'
          : 'Filter the trend by this recorded model ID';
      b.onclick = () => {
        state.model = id;
        refreshUsage();
      };
      $('model-breakdown').append(b);
    }
    if (!models.results.length)
      $('model-breakdown').append(
        el(
          'p',
          'No observed models. This is not a complete model catalog.',
          'muted',
        ),
      );
  } catch (e) {
    if (run === state.usageRun) {
      $('trend').replaceChildren(
        el('p', `Reporting unavailable: ${e.message}`, 'error'),
      );
      $('model-breakdown').replaceChildren(
        el(
          'p',
          'Reporting unavailable; directory and limits remain usable.',
          'muted',
        ),
      );
    }
  } finally {
    if (run === state.usageRun) $('refresh').disabled = false;
  }
}
function renderPeople() {
  const text = $('people-search').value.toLowerCase(),
    dep = $('department').value;
  const people = state.users.filter(
    (u) =>
      (!dep || u.department?.department_id === dep) &&
      `${u.display_name} ${u.email ?? ''}`.toLowerCase().includes(text),
  );
  $('people-table').replaceChildren(
    table(
      ['Person', 'Department', 'Manager', 'Policy'],
      people.map((u) => {
        const name = el('div', u.display_name);
        name.append(el('small', u.email ?? u.user_id));
        const b = el('button', 'Open & set limit');
        b.onclick = () => openEditor('USER', u.user_id);
        return [
          name,
          u.department?.display_name ?? 'Not listed',
          u.manager?.display_name ?? 'Not listed',
          b,
        ];
      }),
    ),
  );
  $('people-note').textContent =
    `${people.length} matching people from ${state.users.length} loaded. ${state.userCursor ? 'Directory is partial; load the next page.' : 'All returned directory pages loaded.'} Department selection filters directory people only, not measured spend.`;
}
function renderLimits() {
  for (const limit of state.limits) {
    const clientId = limit.usage_selector.client_id;
    if (clientId)
      for (const id of ['client', 'limit-client'])
        if (![...$(id).options].some((o) => o.value === clientId))
          $(id).append(option(clientId, `${clientId} · configured policy`));
  }
  $('policies').textContent = state.limits.length;
  $('limits-table').replaceChildren(
    table(
      ['Target', 'Spend client', 'Configured cap', 'Allocation', 'Action'],
      state.limits.map((l) => {
        const b = el('button', 'Edit');
        const supported = ['ORGANIZATION', 'DEFAULT_USER', 'USER'].includes(
          l.target.type,
        );
        b.disabled = !supported;
        b.onclick = () => openEditor(l.target.type, l.target.user_id, l);
        const u = state.users.find((u) => u.user_id === l.target.user_id);
        return [
          u?.display_name ??
            l.target.email ??
            l.target.user_id ??
            l.target.type,
          l.usage_selector.client_id ?? 'Aggregate agents',
          l.value.mode === 'UNLIMITED'
            ? 'Unlimited policy'
            : `${l.value.amount} ${l.value.unit} · ${l.value.enforcement}`,
          l.allocation_mode ?? 'Individual',
          b,
        ];
      }),
    ),
  );
}
function renderOrg() {
  function list(nodes) {
    const ul = el('ul', undefined, 'org-list');
    for (const { user, children } of nodes) {
      const li = el('li'),
        box = el('div', undefined, 'org-node'),
        title = el('div', user.display_name);
      title.append(
        el(
          'small',
          `${user.title ?? 'Title not listed'} · ${user.department?.display_name ?? 'Department not listed'}`,
          'muted',
        ),
      );
      const b = el('button', 'Open person');
      b.onclick = () => openEditor('USER', user.user_id);
      box.append(title, b);
      li.append(box);
      if (children.length) li.append(list(children));
      ul.append(li);
    }
    return ul;
  }
  $('org-tree').replaceChildren(
    list(buildOrgTree(state.users)),
    el(
      'p',
      state.userCursor
        ? 'Partial directory. Load more people before interpreting reporting lines.'
        : 'Missing or cyclic managers appear as independent roots. This is not an authoritative team-membership graph.',
      'muted',
    ),
  );
  $('groups').replaceChildren(
    ...state.groups.map((g) =>
      el('p', `${g.display_name} · ${g.idp_group_id}`),
    ),
  );
}
async function loadCatalog(kind, more = false) {
  const status = $(`status-${kind}`);
  try {
    const response = await api(
      `/api/catalog/${kind}${more && state.userCursor ? `?cursor=${encodeURIComponent(state.userCursor)}` : ''}`,
    );
    state[kind] = more
      ? [
          ...new Map(
            [...state[kind], ...response.results].map((u) => [u.user_id, u]),
          ).values(),
        ]
      : response.results;
    if (kind === 'users') state.userCursor = response.next_cursor;
    // Catalogs page too. Bounded complete load for pickers, manual paging for people.
    if (kind !== 'users') {
      let cursor = response.next_cursor;
      const seen = new Set();
      for (let n = 1; response.has_more && cursor; n++) {
        if (n >= 25 || seen.has(cursor))
          throw new Error(
            'Catalog pagination bound reached; picker is not complete.',
          );
        seen.add(cursor);
        const p = await api(
          `/api/catalog/${kind}?cursor=${encodeURIComponent(cursor)}`,
        );
        state[kind].push(...p.results);
        cursor = p.has_more ? p.next_cursor : null;
      }
    }
    status.textContent = `${kind}: connected${state.caps.mode === 'demo' ? ' (sample)' : ''}`;
    status.classList.remove('failed');
    if (kind === 'departments') {
      $('department').replaceChildren(
        option('', 'All departments'),
        ...state.departments.map((d) =>
          option(d.department_id, d.display_name),
        ),
      );
    }
    if (kind === 'clients') {
      for (const id of ['client', 'limit-client']) {
        $(id).replaceChildren(
          ...(id === 'client' ? [option('', 'All observed clients')] : []),
          option('glean', 'Glean'),
          ...state.clients.map((c) =>
            option(c.usage_client_id, c.display_name),
          ),
        );
      }
    }
    if (kind === 'users') {
      $('more-users').hidden = !state.userCursor;
      $('target-user').replaceChildren(
        ...state.users.map((u) => option(u.user_id, u.display_name)),
      );
      renderPeople();
    }
    renderOrg();
  } catch (e) {
    status.textContent = `${kind}: unavailable · ${e.message}`;
    status.classList.add('failed');
    if (kind !== 'users' || !more) state[kind] = [];
    if (kind === 'groups')
      $('groups').replaceChildren(
        el(
          'p',
          'Group catalog unavailable. No sample data substituted.',
          'muted',
        ),
      );
  }
}
async function refreshLimits() {
  try {
    const r = await api('/api/limits');
    state.limits = r.results;
    renderLimits();
  } catch (e) {
    $('policies').textContent = 'Unavailable';
    $('limits-table').replaceChildren(el('p', e.message, 'error'));
  }
}
function invalidateReview() {
  state.reviewed = null;
  $('save-review').hidden = true;
}
function openEditor(type = 'ORGANIZATION', userId, policy) {
  const selectedClient =
    policy?.usage_selector.client_id ?? ($('client').value || 'glean');
  policy ??= state.limits.find(
    (limit) =>
      limit.target.type === type &&
      (type !== 'USER' || limit.target.user_id === userId) &&
      limit.usage_selector.client_id === selectedClient,
  );
  state.evalRun++;
  invalidateReview();
  $('evaluation').replaceChildren();
  $('editor-message').textContent = '';
  $('target-type').value = type;
  if (userId && ![...$('target-user').options].some((o) => o.value === userId))
    $('target-user').append(option(userId, policy?.target.email ?? userId));
  if (userId) $('target-user').value = userId;
  $('user-label').hidden = type !== 'USER';
  const client =
    policy?.usage_selector.client_id ?? ($('client').value || 'glean');
  if (![...$('limit-client').options].some((o) => o.value === client))
    $('limit-client').append(option(client, `${client} · configured policy`));
  $('limit-client').value = client;
  $('editor-title').textContent =
    type === 'USER'
      ? 'Person’s monthly limit'
      : policy
        ? 'Edit monthly limit'
        : 'New monthly limit';
  $('editor-context').textContent =
    type === 'USER'
      ? (state.users.find((u) => u.user_id === userId)?.display_name ?? userId)
      : 'Workspace or default per-person policy';
  $('cap-mode').value = policy?.value.mode ?? 'FINITE';
  $('amount').value = policy?.value.amount ?? '600';
  $('limit-unit').value = policy?.value.unit ?? 'CREDITS';
  $('enforcement').value = policy?.value.enforcement ?? 'HARD';
  $('finite-fields').hidden = $('cap-mode').value === 'UNLIMITED';
  if (!$('editor').open) $('editor').showModal();
  if (type !== 'DEFAULT_USER') evaluate();
}
async function evaluate() {
  const run = ++state.evalRun;
  const type = $('target-type').value;
  if (type === 'DEFAULT_USER') {
    $('evaluation').replaceChildren(
      el(
        'p',
        'Choose a concrete person to evaluate inherited default policies.',
      ),
    );
    return;
  }
  const q = {
    target:
      type === 'USER' ? { type, user_id: $('target-user').value } : { type },
    usage_selector: { client_id: $('limit-client').value, period: PERIOD },
  };
  $('evaluation').replaceChildren(
    el('p', 'Loading live configured-budget status…'),
  );
  try {
    const r = await api('/api/usage/evaluate', q);
    if (run !== state.evalRun) return;
    const nodes = [
      el(
        'strong',
        `${r.applicable_policy_count} applicable policies · ${r.decision}`,
      ),
      el(
        'p',
        r.used_by_unit
          ? `Live used: ${r.used_by_unit.map((v) => `${v.used} ${v.unit}`).join(' · ')}`
          : 'Policy-independent live usage not available in this backend version.',
      ),
      el(
        'p',
        `Effective headroom: ${r.effective_limits.map((v) => (v.mode === 'UNLIMITED' ? (r.applicable_policy_count === 0 ? 'No finite configured policy (not a runtime guarantee)' : 'No finite cap') : `${v.remaining} ${v.unit} · ${v.enforcement}`)).join(' · ')}`,
      ),
    ];
    for (const rule of r.evaluated_limits)
      nodes.push(
        el(
          'p',
          `${rule.target.type}: ${rule.value.mode === 'UNLIMITED' ? 'Unlimited policy' : `configured ${rule.value.amount} ${rule.value.unit}; used ${rule.used}; ${rule.remaining === undefined ? 'per-rule headroom unavailable' : `remaining ${rule.remaining}`}`}`,
        ),
      );
    nodes.push(
      el(
        'small',
        `Evaluated ${r.evaluated_at}. Configured-budget status is not runtime admission.`,
        'muted',
      ),
    );
    $('evaluation').replaceChildren(...nodes);
  } catch (e) {
    if (run === state.evalRun)
      $('evaluation').replaceChildren(el('p', e.message, 'error'));
  }
}
function review() {
  try {
    state.reviewed = makeLimit({
      type: $('target-type').value,
      userId: $('target-user').value,
      clientId: $('limit-client').value,
      amount: $('amount').value,
      unit: $('limit-unit').value,
      enforcement: $('enforcement').value,
      unlimited: $('cap-mode').value === 'UNLIMITED',
    });
    $('policy-json').textContent = JSON.stringify(state.reviewed, null, 2);
    $('save-review').hidden = false;
    $('save').disabled = !state.caps.writes;
    $('save').textContent =
      state.caps.mode === 'demo'
        ? 'Apply to sample data'
        : state.caps.writes
          ? 'Apply to connected workspace'
          : 'Live writes disabled';
    $('editor-message').textContent =
      state.caps.mode === 'demo'
        ? 'Sample policies live in server memory and reset on restart.'
        : 'Review the workspace and target carefully. No automatic retry.';
  } catch (e) {
    $('editor-message').textContent = e.message;
  }
}
async function save() {
  if (!state.reviewed) return;
  $('save').disabled = true;
  try {
    const r = await api('/api/limits', state.reviewed);
    $('editor-message').textContent =
      `Saved returned policy: ${JSON.stringify(r.results[0])}. Request ${r.request_id}.`;
    invalidateReview();
    await refreshLimits();
    await evaluate();
  } catch (e) {
    $('editor-message').textContent =
      `${e.message} Read configured policies before retrying an uncertain write.`;
    invalidateReview();
  }
}
function preset(name) {
  state.labKind = name === 'evaluate' ? 'evaluate' : 'search';
  state.labQuery = null;
  state.labCursor = null;
  $('next-page').hidden = true;
  const q =
    name === 'evaluate'
      ? {
          target: { type: 'ORGANIZATION' },
          usage_selector: {
            client_id: $('client').value || 'glean',
            period: PERIOD,
          },
        }
      : {
          ...query(
            name === 'models' ? ['MODEL'] : name === 'users' ? ['USER'] : [],
            name === 'trend' ? 'DAY' : 'NONE',
            false,
          ),
          page_size: 2,
        };
  $('lab-request').value = JSON.stringify(q, null, 2);
  $('lab-endpoint').textContent =
    `/api/admin/usage/${name === 'evaluate' ? 'limits/evaluate' : 'search'}`;
}
async function replay(next = false) {
  $('replay').disabled = true;
  $('next-page').disabled = true;
  try {
    const q = next
      ? { ...state.labQuery, cursor: state.labCursor }
      : JSON.parse($('lab-request').value);
    if (!next) {
      state.labQuery = structuredClone(q);
      state.labCursor = null;
    }
    const r = await api(`/api/usage/${state.labKind}`, q);
    $('lab-response').textContent = JSON.stringify(r, null, 2);
    state.labCursor = r.has_more ? r.next_cursor : null;
    $('next-page').hidden = !state.labCursor;
  } catch (e) {
    $('lab-response').textContent = e.message;
    state.labCursor = null;
    $('next-page').hidden = true;
  } finally {
    $('replay').disabled = false;
    $('next-page').disabled = false;
  }
}
document
  .querySelectorAll('[data-view]')
  .forEach((b) => (b.onclick = () => show(b.dataset.view)));
$('goto-people').onclick = () => show('people');
$('create').onclick = () => openEditor();
$('close-editor').onclick = () => {
  $('editor').close();
  state.evalRun++;
};
$('editor').addEventListener('close', () => state.evalRun++);
$('refresh').onclick = refreshUsage;
$('clear-model').onclick = () => {
  state.model = null;
  refreshUsage();
};
$('people-search').oninput = renderPeople;
$('department').onchange = renderPeople;
$('more-users').onclick = () => loadCatalog('users', true);
for (const id of [
  'target-type',
  'target-user',
  'limit-client',
  'cap-mode',
  'amount',
  'limit-unit',
  'enforcement',
])
  $(id).addEventListener('input', () => {
    invalidateReview();
    $('user-label').hidden = $('target-type').value !== 'USER';
    $('finite-fields').hidden = $('cap-mode').value === 'UNLIMITED';
    if (['target-type', 'target-user', 'limit-client'].includes(id)) {
      state.evalRun++;
      $('evaluation').replaceChildren(
        el('p', 'Selection changed. Refresh live status.'),
      );
    }
  });
$('evaluate').onclick = evaluate;
$('review').onclick = review;
$('save').onclick = save;
document
  .querySelectorAll('[data-preset]')
  .forEach((b) => (b.onclick = () => preset(b.dataset.preset)));
$('replay').onclick = () => replay();
$('next-page').onclick = () => replay(true);
$('lab-request').oninput = () => {
  state.labCursor = null;
  $('next-page').hidden = true;
};
const now = new Date(),
  start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
$('start').value = start.toISOString().slice(0, 10);
$('end').value = end.toISOString().slice(0, 10);
try {
  state.caps = await api('/api/capabilities');
  $('brand').textContent = state.caps.brand;
  $('workspace').textContent = state.caps.workspace;
  document.title = `Usage & limits · ${state.caps.brand}`;
  $('mode').textContent =
    state.caps.mode === 'demo'
      ? 'Sample data'
      : state.caps.writes
        ? 'Live · writes enabled'
        : 'Live · read-only';
  $('notice').textContent =
    state.caps.mode === 'demo'
      ? 'Demo mode · fictional people, clients, models, and consumption. Limit changes affect only in-memory sample policies. No Glean credentials or requests.'
      : 'Live mode · every panel uses real API responses or an explicit unavailable state. Historical observations and current-period headroom have different freshness; empty data does not prove zero.';
  for (const kind of ['users', 'departments', 'clients', 'groups']) {
    const s = el('span', `${kind}: loading`);
    s.id = `status-${kind}`;
    $('catalog-status').append(s);
  }
  await Promise.all(
    ['users', 'departments', 'clients', 'groups'].map((k) => loadCatalog(k)),
  );
  await Promise.all([refreshLimits(), refreshUsage()]);
  preset('trend');
} catch (e) {
  $('notice').textContent = e.message;
}
