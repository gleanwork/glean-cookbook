import {
  PERIOD,
  PREMIUM_POLICY_CLIENT,
  buildOrgTree,
  limitKey,
  makeLimit,
} from '/contracts.mjs';
const $ = (id) => document.getElementById(id);
const state = {
  users: [],
  departments: [],
  clients: [],
  limits: [],
  caps: {},
  reviewed: null,
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
// Unknown action types must render, not fail: the API may add values.
function describeAction(a) {
  if (a.type === 'NOTIFY') return `Notify admins at ${a.at_percent}%`;
  if (a.type === 'RESTRICT_MODELS')
    return `Restrict to ${a.allow?.models?.length ?? 0} allowed model(s) at ${a.at_percent}%`;
  if (a.type === 'BLOCK') return `Block at ${a.at_percent}%`;
  return `${a.type} at ${a.at_percent}%`;
}
const isPremiumPolicy = (l) => l.target.client_id === PREMIUM_POLICY_CLIENT;
// Spend clients that the OAuth client list does not return are typed as exact
// IDs. The empty option value selects the typed field.
function addClientOption(clientId) {
  if (![...$('limit-client').options].some((o) => o.value === clientId))
    $('limit-client').insertBefore(
      option(clientId, `${clientId} · configured policy`),
      $('limit-client').lastElementChild,
    );
}
function selectedClient() {
  return $('limit-client').value || $('custom-client').value;
}
function syncClientField() {
  $('custom-client-label').hidden = $('limit-client').value !== '';
}
function renderLimits() {
  for (const limit of state.limits) {
    const clientId = limit.target.client_id;
    if (clientId && !isPremiumPolicy(limit)) addClientOption(clientId);
  }
  $('limits-table').replaceChildren(
    table(
      [
        'Target',
        'Spend client',
        'Configured cap',
        'Allocation',
        'Thresholds',
        'Action',
      ],
      state.limits.map((l) => {
        const b = el('button', 'Edit');
        const supported =
          ['ORGANIZATION', 'DEFAULT_USER', 'USER'].includes(l.target.type) &&
          !isPremiumPolicy(l);
        b.disabled = !supported;
        b.title = isPremiumPolicy(l)
          ? 'The workspace premium-model policy is managed in the Admin console.'
          : supported
            ? ''
            : 'Agent limits are outside this recipe.';
        b.onclick = () => openEditor(l.target.type, l.target.user_id, l);
        const u = state.users.find((u) => u.user_id === l.target.user_id);
        return [
          isPremiumPolicy(l)
            ? 'Every user · premium models'
            : (u?.display_name ??
              l.target.email ??
              l.target.user_id ??
              l.target.agent_id ??
              l.target.type),
          isPremiumPolicy(l)
            ? 'All clients'
            : (l.target.client_id ?? 'Aggregate agents'),
          !l.value
            ? 'No cap (actions only)'
            : l.value.mode === 'UNLIMITED'
              ? 'Unlimited policy'
              : `${l.value.amount} ${l.value.unit} · ${l.value.enforcement}`,
          l.allocation_mode ?? 'Individual',
          l.actions?.length ? l.actions.map(describeAction).join('; ') : '—',
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
      $('limit-client').replaceChildren(
        option('glean', 'Glean'),
        ...state.clients.map((c) => option(c.usage_client_id, c.display_name)),
        option('', 'Other client ID…'),
      );
      for (const limit of state.limits)
        if (!isPremiumPolicy(limit)) addClientOption(limit.target.client_id);
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
  }
}
async function refreshLimits() {
  try {
    const r = await api('/api/limits');
    state.limits = r.results;
    renderLimits();
  } catch (e) {
    $('limits-table').replaceChildren(el('p', e.message, 'error'));
  }
}
function invalidateReview() {
  state.reviewed = null;
  $('save-review').hidden = true;
}
function configuredPolicy(type, userId, clientId) {
  return state.limits.find(
    (limit) =>
      limit.target.type === type &&
      (type !== 'USER' || limit.target.user_id === userId) &&
      limit.target.client_id === clientId,
  );
}
function syncReset() {
  const policy = configuredPolicy(
    $('target-type').value,
    $('target-user').value,
    selectedClient(),
  );
  $('reset').hidden = !policy;
  $('reset').disabled = !state.caps.writes;
}
function openEditor(type = 'ORGANIZATION', userId, policy) {
  policy ??= configuredPolicy(type, userId, 'glean');
  state.evalRun++;
  invalidateReview();
  $('evaluation').replaceChildren();
  $('editor-message').textContent = '';
  $('target-type').value = type;
  if (userId && ![...$('target-user').options].some((o) => o.value === userId))
    $('target-user').append(option(userId, policy?.target.email ?? userId));
  if (userId) $('target-user').value = userId;
  $('user-label').hidden = type !== 'USER';
  const client = policy?.target.client_id ?? 'glean';
  addClientOption(client);
  $('limit-client').value = client;
  $('custom-client').value = '';
  syncClientField();
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
  syncReset();
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
  const client_id = selectedClient();
  if (!client_id) {
    $('evaluation').replaceChildren(
      el('p', 'Enter the exact spend-client ID to evaluate.'),
    );
    return;
  }
  const q = {
    target:
      type === 'USER'
        ? { type, client_id, user_id: $('target-user').value }
        : { type, client_id },
    period: PERIOD,
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
        `Effective headroom: ${r.effective_limits.map((v) => (v.mode === 'UNLIMITED' ? (r.applicable_policy_count === 0 ? 'No finite configured policy (not a runtime guarantee)' : 'No finite cap') : `${v.remaining} ${v.unit} · ${v.enforcement}`)).join(' · ')}`,
      ),
    ];
    // decision_causes never carry amounts or identities, so a SHARED cause is
    // the only signal that a pooled budget, not this target's own, is reached.
    for (const cause of r.decision_causes)
      nodes.push(
        el(
          'p',
          `${cause.decision}: ${cause.budget_scope === 'TARGET' ? 'own' : 'shared'} ${cause.source_type} budget reached`,
          cause.decision === 'BLOCKED' ? 'error' : undefined,
        ),
      );
    for (const rule of r.evaluated_limits) {
      const source =
        rule.target.type === 'DEPARTMENT'
          ? `DEPARTMENT ${rule.target.department_name}`
          : rule.target.type === 'IDP_GROUP'
            ? `IDP_GROUP ${rule.target.idp_group_id ?? '(restricted)'}`
            : rule.target.type;
      const actions = [
        ...rule.active_actions.map((a) => `active: ${describeAction(a)}`),
        ...(rule.next_action
          ? [`next: ${describeAction(rule.next_action)}`]
          : []),
      ];
      nodes.push(
        el(
          'p',
          `${source}: ${rule.value.mode === 'UNLIMITED' ? 'Unlimited policy' : `configured ${rule.value.amount} ${rule.value.unit}`}; used ${rule.used}; ${rule.decision}${actions.length ? ` · ${actions.join(' · ')}` : ''}`,
        ),
      );
    }
    for (const restriction of r.restrictions)
      nodes.push(
        el('p', `Models restricted to ${restriction.allow.models.join(', ')}.`),
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
      clientId: selectedClient(),
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
      `Saved returned policy: ${JSON.stringify(r.usage_limit)}. Request ${r.request_id}.`;
    invalidateReview();
    await refreshLimits();
    syncReset();
    await evaluate();
  } catch (e) {
    $('editor-message').textContent =
      `${e.message} Read configured policies before retrying an uncertain write.`;
    invalidateReview();
  }
}
async function reset() {
  const policy = configuredPolicy(
    $('target-type').value,
    $('target-user').value,
    selectedClient(),
  );
  if (!policy) return;
  const key = limitKey(policy);
  if (
    !confirm(
      `Remove the configured policy for ${JSON.stringify(key.target)}? Measured usage is not cleared.`,
    )
  )
    return;
  $('reset').disabled = true;
  try {
    const r = await api('/api/limits/reset', key);
    $('editor-message').textContent = r.is_configuration_removed
      ? `Removed the policy. Request ${r.request_id}.`
      : `No matching policy was configured. Request ${r.request_id}.`;
    invalidateReview();
    await refreshLimits();
    syncReset();
    await evaluate();
  } catch (e) {
    $('editor-message').textContent =
      `${e.message} Read configured policies before retrying an uncertain write.`;
    $('reset').disabled = !state.caps.writes;
  }
}
document
  .querySelectorAll('[data-view]')
  .forEach((b) => (b.onclick = () => show(b.dataset.view)));
$('create').onclick = () => openEditor();
$('close-editor').onclick = () => {
  $('editor').close();
  state.evalRun++;
};
$('editor').addEventListener('close', () => state.evalRun++);
$('people-search').oninput = renderPeople;
$('department').onchange = renderPeople;
$('more-users').onclick = () => loadCatalog('users', true);
for (const id of [
  'target-type',
  'target-user',
  'limit-client',
  'custom-client',
  'cap-mode',
  'amount',
  'limit-unit',
  'enforcement',
])
  $(id).addEventListener('input', () => {
    invalidateReview();
    $('user-label').hidden = $('target-type').value !== 'USER';
    $('finite-fields').hidden = $('cap-mode').value === 'UNLIMITED';
    syncClientField();
    if (
      ['target-type', 'target-user', 'limit-client', 'custom-client'].includes(
        id,
      )
    ) {
      syncReset();
      state.evalRun++;
      $('evaluation').replaceChildren(
        el('p', 'Selection changed. Refresh live status.'),
      );
    }
  });
$('evaluate').onclick = evaluate;
$('review').onclick = review;
$('save').onclick = save;
$('reset').onclick = reset;
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
      ? 'Demo mode · fictional people, clients, and consumption. Limit changes affect only in-memory sample policies. No Glean credentials or requests.'
      : 'Live mode · every panel uses real API responses or an explicit unavailable state.';
  for (const kind of ['users', 'departments', 'clients']) {
    const s = el('span', `${kind}: loading`);
    s.id = `status-${kind}`;
    $('catalog-status').append(s);
  }
  await refreshLimits();
  await Promise.all(
    ['users', 'departments', 'clients'].map((k) => loadCatalog(k)),
  );
} catch (e) {
  $('notice').textContent = e.message;
}
