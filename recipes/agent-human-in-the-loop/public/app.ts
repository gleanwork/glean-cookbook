import {
  batchKey,
  curlFor,
  decisionsFor,
  identifier,
  parseSnapshot,
  stateHelp,
  terminal,
  type Decision,
  type Exchange,
  type Responses,
  type Snapshot,
} from './model.js';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}
const button = (id: string) => element<HTMLButtonElement>(id);
const input = (id: string) => element<HTMLInputElement>(id);
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const notice = (text: string) => {
  element('notice').textContent = text;
};
let agentId = '';
let snapshot: Snapshot | undefined;
let busy = false;
let polling = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let pollDeadline = 0;
let retryDelay = 2_000;
let choices = new Map<string, Decision>();
let lastSubmission: { runId: string; key: string; body: Responses } | undefined;
const storageKey = 'glean-hitl-run';

function controls() {
  for (const id of ['start', 'attach']) button(id).disabled = busy || !agentId;
  button('refresh').disabled = busy || !snapshot;
  button('poll').disabled =
    busy ||
    !snapshot ||
    terminal(snapshot.run.state) ||
    snapshot.run.state === 'REQUIRES_INPUT';
  button('poll').textContent = polling ? 'Stop polling' : 'Start polling';
  button('cancel').disabled =
    busy ||
    !snapshot ||
    terminal(snapshot.run.state) ||
    !input('authorize-cancel').checked;
  let complete = false;
  try {
    if (snapshot) {
      decisionsFor(snapshot, choices);
      complete = true;
    }
  } catch {
    /* incomplete decisions */
  }
  button('submit-decisions').disabled = busy || !complete;
  button('retry').hidden =
    !lastSubmission || lastSubmission.runId !== snapshot?.run.run_id;
  button('retry').disabled = busy;
}
function stopPolling() {
  polling = false;
  clearTimeout(timer);
  element('poll-status').textContent =
    'Polling is off. The server run may still be active.';
  controls();
}
function renderInteractions() {
  const root = element('interactions');
  root.replaceChildren();
  for (const item of snapshot?.run.pending_interactions ?? []) {
    const field = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = item.display_name;
    const id = document.createElement('p');
    id.className = 'interaction-id';
    id.textContent = `Interaction: ${item.interaction_id}${item.tool_id ? ` · Tool: ${item.tool_id}` : ''}`;
    const description = document.createElement('p');
    description.textContent = item.description;
    const args = document.createElement('pre');
    args.textContent = pretty(item.arguments);
    field.append(legend, id, description, args);
    if (item.expires_at) {
      const expiry = document.createElement('p');
      expiry.textContent = `API-provided approval deadline: ${item.expires_at}`;
      field.append(expiry);
    }
    for (const decision of ['APPROVE', 'REJECT'] as const) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = item.interaction_id;
      radio.value = decision;
      radio.checked = choices.get(item.interaction_id) === decision;
      radio.addEventListener('change', () => {
        choices.set(item.interaction_id, decision);
        controls();
      });
      label.append(
        radio,
        decision === 'APPROVE' ? 'Approve invocation' : 'Reject invocation',
      );
      field.append(label);
    }
    root.append(field);
  }
  element('review-help').textContent =
    snapshot?.run.state === 'REQUIRES_INPUT'
      ? 'Review every invocation and choose a decision for each. Submit the complete batch once.'
      : 'No current approval batch. A rejected invocation can still lead to a successful run.';
}
function apply(value: unknown) {
  const next = parseSnapshot(value);
  if (next.run.agent_id !== agentId)
    throw new Error('The API returned a different agent ID.');
  const sameRun = snapshot?.run.run_id === next.run.run_id;
  const changed = !snapshot || batchKey(snapshot) !== batchKey(next);
  if (!sameRun) {
    element('timeline').replaceChildren();
    lastSubmission = undefined;
    input('authorize-cancel').checked = false;
  }
  if (changed) {
    choices = new Map();
    if (
      next.run.state === 'REQUIRES_INPUT' &&
      lastSubmission?.key !== batchKey(next)
    )
      lastSubmission = undefined;
  }
  if (
    !sameRun ||
    snapshot?.run.state !== next.run.state ||
    (changed && next.run.state === 'REQUIRES_INPUT')
  ) {
    const li = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = next.run.state;
    const time = document.createElement('time');
    time.dateTime = new Date().toISOString();
    time.textContent = `Observed at ${new Date().toLocaleTimeString()}`;
    li.append(label, time);
    element('timeline').append(li);
    if (element('timeline').children.length > 60)
      element('timeline').firstElementChild?.remove();
  }
  snapshot = next;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ agentId, runId: next.run.run_id }),
    );
  } catch {
    /* storage is optional */
  }
  input('attach-id').value = next.run.run_id;
  input('run-id').value = next.run.run_id;
  element('state').textContent = next.run.state;
  element('state').dataset.state = next.run.state;
  element('state-help').textContent = stateHelp[next.run.state];
  element('updated').textContent =
    `Persisted activity: ${next.run.updated_at}. Not a heartbeat or exact transition time.${next.run.expires_at ? ` Execution deadline: ${next.run.expires_at}.` : ''}`;
  element('output').textContent = pretty({
    output: next.run.output ?? null,
    error: next.run.error ?? null,
  });
  if (terminal(next.run.state))
    element<HTMLDetailsElement>('output-section').open = true;
  renderInteractions();
  if (terminal(next.run.state) || next.run.state === 'REQUIRES_INPUT')
    stopPolling();
  controls();
}
function showExchange(exchange: Exchange) {
  const root = element('exchanges');
  root.querySelector('.empty')?.remove();
  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = `${exchange.method} ${exchange.path} → HTTP ${exchange.status}`;
  const request = document.createElement('pre');
  request.textContent = curlFor(exchange);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary';
  copy.textContent = 'Copy curl (credential variable only)';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(curlFor(exchange));
      notice(
        'Copied curl. Supply credentials in your shell; review any sensitive tool arguments before sharing.',
      );
    } catch {
      notice('Clipboard is unavailable. Select the curl text to copy it.');
    }
  });
  const response = document.createElement('pre');
  response.textContent = pretty(exchange.body);
  details.append(summary, request, copy, response);
  const previous = root.firstElementChild;
  if (previous instanceof HTMLDetailsElement) previous.open = false;
  root.prepend(details);
  while (root.children.length > 12) root.lastElementChild?.remove();
}
async function request(
  route: string,
  method = 'GET',
  body?: unknown,
  expectedStatus = 200,
) {
  const response = await fetch(route, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Cookbook-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(65_000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? `Local HTTP ${response.status}`);
  const exchange = data as Exchange;
  showExchange(exchange);
  if (exchange.status !== expectedStatus) {
    if (exchange.status === 429 && method === 'GET' && polling) {
      retryDelay = Math.max(
        retryDelay * 2,
        (exchange.retryAfterSeconds ?? 0) * 1000,
      );
      notice(
        'GET was rate limited. Polling will respect Retry-After within the local waiting budget.',
      );
      return;
    }
    const conflictRun =
      /^\/api\/runs\/([A-Za-z0-9_-]+)\/(responses|cancellations)$/.exec(route);
    if (exchange.status === 409 && method === 'POST' && conflictRun) {
      choices.clear();
      lastSubmission = undefined;
      renderInteractions();
      // Read the current batch, but never transfer old choices onto it.
      await request(`/api/runs/${conflictRun[1]}`);
      notice(
        'HTTP 409: stale, incomplete, conflicting decisions, or unavailable cancellation. Current snapshot refreshed; review again.',
      );
      return;
    }
    throw new Error(
      `Glean HTTP ${exchange.status}. Inspect the response above. A failed HTTP request is not a FAILED run. Do not blindly retry a POST.`,
    );
  }
  retryDelay = 2_000;
  const expectedRun = /^\/api\/runs\/([A-Za-z0-9_-]+)/.exec(route)?.[1];
  if (expectedRun && parseSnapshot(exchange.body).run.run_id !== expectedRun) {
    throw new Error(
      'The API returned a different run ID. Refusing to switch the reviewed execution.',
    );
  }
  apply(exchange.body);
}
async function action(work: () => Promise<void>) {
  if (busy) return;
  busy = true;
  controls();
  try {
    await work();
  } catch (error) {
    stopPolling();
    notice(
      `${error instanceof Error ? error.message : 'Request failed.'} If a POST response was lost, retrieve the saved run ID. Only retry approval with the identical saved decisions; do not blindly start another run.`,
    );
  } finally {
    busy = false;
    controls();
  }
}
function schedulePoll() {
  if (!polling) return;
  if (Date.now() + retryDelay >= pollDeadline) {
    stopPolling();
    notice(
      'The two-minute local polling budget ended. This does not stop or expire the server run. Refresh or start polling again.',
    );
    return;
  }
  timer = setTimeout(async () => {
    await action(() => request(`/api/runs/${snapshot!.run.run_id}`));
    schedulePoll();
  }, retryDelay);
}
function startPolling() {
  if (
    !snapshot ||
    terminal(snapshot.run.state) ||
    snapshot.run.state === 'REQUIRES_INPUT'
  )
    return;
  clearTimeout(timer);
  polling = true;
  pollDeadline = Date.now() + 120_000;
  element('poll-status').textContent =
    'Polling GET every 2 seconds, with a two-minute local waiting budget.';
  controls();
  schedulePoll();
}
element('start-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void action(async () => {
    stopPolling();
    await request(
      '/api/runs',
      'POST',
      { message: element<HTMLTextAreaElement>('message').value },
      201,
    );
    input('authorize-start').checked = false;
    notice(
      'Inspect the saved run ID and current state. Closing this page does not cancel execution.',
    );
    startPolling();
  });
});
element('attach-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void action(async () => {
    stopPolling();
    const runId = input('attach-id').value.trim();
    if (!identifier(runId)) throw new Error('Supply a valid run ID.');
    await request(`/api/runs/${runId}`);
    notice('Attached to the persisted run. No new execution was created.');
    startPolling();
  });
});
element('decisions-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void action(async () => {
    if (!snapshot) return;
    lastSubmission = {
      runId: snapshot.run.run_id,
      key: batchKey(snapshot),
      body: decisionsFor(snapshot, choices),
    };
    await request(
      `/api/runs/${lastSubmission.runId}/responses`,
      'POST',
      lastSubmission.body,
    );
    startPolling();
  });
});
button('retry').addEventListener(
  'click',
  () =>
    void action(async () => {
      if (!lastSubmission) return;
      await request(
        `/api/runs/${lastSubmission.runId}/responses`,
        'POST',
        lastSubmission.body,
      );
      startPolling();
    }),
);
button('refresh').addEventListener(
  'click',
  () =>
    void action(async () => {
      stopPolling();
      if (snapshot) await request(`/api/runs/${snapshot.run.run_id}`);
    }),
);
button('poll').addEventListener('click', () =>
  polling ? stopPolling() : startPolling(),
);
input('authorize-cancel').addEventListener('change', controls);
button('cancel').addEventListener(
  'click',
  () =>
    void action(async () => {
      if (!snapshot || !input('authorize-cancel').checked) return;
      stopPolling();
      await request(`/api/runs/${snapshot.run.run_id}/cancellations`, 'POST');
      input('authorize-cancel').checked = false;
      notice(
        'Cancellation requested. Read the observed state; completed external effects cannot be undone.',
      );
      startPolling();
    }),
);
button('forget').addEventListener('click', () => {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* storage may be disabled */
  }
  input('attach-id').value = '';
  notice(
    'Forgot the saved ID only. The server run and its external effects are unchanged.',
  );
});
controls();
try {
  const response = await fetch('/api/config', {
    headers: { 'X-Cookbook-Request': '1' },
  });
  if (!response.ok) throw new Error('Could not load local configuration.');
  const config = await response.json();
  if (!identifier(config.agentId))
    throw new Error('Configure a valid agent ID in .env.');
  agentId = config.agentId;
  element('agent-id').textContent = agentId;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved?.agentId === agentId && identifier(saved.runId))
      input('attach-id').value = saved.runId;
  } catch {
    /* storage is optional */
  }
} catch (error) {
  notice(error instanceof Error ? error.message : 'Configuration failed.');
}
controls();
