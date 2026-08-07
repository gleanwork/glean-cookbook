// Live verification for incident-copilot.
//
// Split of responsibility with the recipe's own fixture gate: that one controls both
// sides, so it asserts exact evidence classifications against a known corpus. This
// runs against a real instance where the corpus is whatever the reader indexed, so
// asserting "PAY-2114 must be the precedent" would be asserting a fact about
// someone else's documents.
//
// What holds on any corpus is the governance, and that is the whole claim: the gate
// refuses an unauthorized actor, expiry escalates without executing, only
// pre-registered actions can run, a mutating action needs a supported cause, and
// every attempt lands in the audit log. Those are asserted here.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Platform Search + Chat, plus an optional agent run. The registered actions are
// simulated in-process, so nothing is written to the instance and no ticket, PR, or
// channel message is created anywhere.
export const sideEffects = 'read-only';

export const requiredEnv = ['GLEAN_API_TOKEN', 'GLEAN_SERVER_URL'];

const PORT = 3388;
const BASE = `http://localhost:${PORT}`;
const ONCALL_FALLBACK = 'marcus.webb@sample.example.com';
const OUTSIDER = 'definitely-not-on-call@sample.example.com';

const post = (p, body, actor) =>
  fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { 'X-Incident-Actor': actor } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

async function waitUp() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/config`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export async function setup(context) {
  const cwd = path.join(context.repoRoot, 'recipes/incident-copilot');
  const child = spawn('npx', ['tsx', 'server.ts'], {
    cwd,
    detached: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      GLEAN_USE_FIXTURE: 'false',
      WATCHED_SERVICES:
        process.env.WATCHED_SERVICES ??
        process.env.VERIFY_SERVICE ??
        'payments-service',
      // Per-request actors are a demo affordance now.
      INCIDENT_DEMO_MODE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  if (!(await waitUp())) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill();
    }
    throw new Error(`server did not start:\n${stderr}`);
  }
  return { child };
}

export async function teardown(context) {
  const child = context.child;
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

const ALARM = {
  id: 'VERIFY-1',
  service: process.env.VERIFY_SERVICE ?? 'payments-service',
  kind: 'canary',
  metric: 'authorization failure rate',
  summary:
    'Canary alarm during deploy: authorization failure rate rose sharply at 5% rollout',
  severity: 'Sev2',
  firedAt: new Date().toISOString(),
};

const NOVEL = {
  ...ALARM,
  id: 'VERIFY-2',
  kind: 'saturation',
  metric: 'write queue depth',
  summary: 'Write queue depth growing unbounded; no deploy in flight',
};

async function fire(alarm, orchestrator = 'app') {
  await post('/api/reset');
  const response = await post(
    `/webhook/pagerduty?orchestrator=${orchestrator}`,
    alarm,
  );
  return response.json();
}

function checkContract(incident) {
  // Every cause claim must rest on a precedent, on any corpus.
  for (const hypothesis of incident.hypotheses) {
    const nonPrecedent = hypothesis.evidence.find(
      (item) => item.role !== 'precedent',
    );
    if (nonPrecedent) {
      return `a cause claim cited a ${nonPrecedent.role} document ("${nonPrecedent.title}"); only precedents may license a cause`;
    }
  }
  const supported = incident.hypotheses.some(
    (hypothesis) => hypothesis.confidence === 'supported',
  );
  const action = incident.proposed?.actionId;
  if (action === 'draft-fix-pr' && !supported) {
    return 'a mutating action was offered with no evidence-supported cause';
  }
  return null;
}

// Scenario dispatch by position in demoQueries, not by matching its prose.
//
// These branches used to switch on the query text ('Triage the payments canary
// alarm'). recipe.json was later reworded to stop naming services from the sample
// catalog -- 'alarm' became 'alert' among them -- and two of the five prefixes then
// matched nothing, so those scenarios fell through to the "no assertion
// implemented" return. A green run reports that as a pass, which makes it worse
// than a failure: the two most important scenarios here are the evidence rules.
//
// recipe.json owns the wording; this file owns the order. Rewording is free, and
// adding or removing a query fails loudly instead of skipping an assertion.
const SCENARIOS = [
  'matching-precedent',
  'no-precedent',
  'unauthorized-approver',
  'expiry',
  'unregistered-action',
];

const RECIPE = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../recipes/incident-copilot/recipe.json',
    ),
    'utf8',
  ),
);

function scenarioFor(query) {
  const queries = RECIPE.demoQueries ?? [];
  if (queries.length !== SCENARIOS.length) {
    throw new Error(
      `recipe.json declares ${queries.length} demo queries but this harness has ` +
        `${SCENARIOS.length} scenarios (${SCENARIOS.join(', ')}). Add or remove an ` +
        `assertion to match, rather than leaving a query unverified.`,
    );
  }
  const index = queries.findIndex((entry) => entry.query === query);
  if (index === -1) {
    throw new Error(
      `"${query}" is not in recipes/incident-copilot/recipe.json demoQueries`,
    );
  }
  return SCENARIOS[index];
}

/**
 * Why no incident came back. The webhook answers with `filtered`, `refused` or
 * `error` depending on what stopped it; reading only one of them reports
 * `undefined`, which is what hid a 400 from /api/search behind a message that
 * read like a thin corpus.
 *
 * A missing service catalog entry is a skip, not a failure: this recipe reads
 * ownership and the approval set out of the reader's own catalog, and says so in
 * its prerequisites. Without one there is nothing to authorize against, which is
 * a fact about the corpus rather than a defect in the recipe.
 */
function noIncident(body) {
  if (body.error) {
    if (/No service catalog entry found/u.test(body.error)) {
      return {
        skip:
          `${body.error} ` +
          `This recipe needs a service catalog document indexed in the format it parses ` +
          `(Tech lead / On-call this week / Tier / Dependencies), per its prerequisites. ` +
          `Point VERIFY_SERVICE at a service yours describes.`,
      };
    }
    return `no incident was created — the server failed: ${body.error}`;
  }
  if (body.filtered)
    return `no incident was created — the alarm was filtered: ${body.reason}`;
  if (body.refused) return `no incident was created — refused: ${body.refused}`;
  return `no incident was created, and the server gave no reason: ${JSON.stringify(body).slice(0, 300)}`;
}

export async function run(query, _context) {
  const scenario = scenarioFor(query);

  if (scenario === 'matching-precedent') {
    const body = await fire(ALARM);
    const { incident } = body;
    if (!incident) return noIncident(body);
    if (incident.channel[0]?.kind !== 'ack') {
      return 'the copilot did not acknowledge before triaging';
    }
    if (!incident.service.onCall || !incident.service.techLead) {
      return 'the service registry did not resolve an on-call engineer and owner — check that a service catalog entry is indexed';
    }
    if (incident.status !== 'awaiting-approval') {
      return `expected to reach the approval gate, got status ${incident.status}`;
    }
    if (!incident.expiresAt)
      return 'no expiry deadline was set on the proposal';
    const contract = checkContract(incident);
    if (contract) return contract;
    return null;
  }

  if (scenario === 'no-precedent') {
    const body = await fire(NOVEL);
    const { incident } = body;
    if (!incident) return noIncident(body);
    // Corpus-independent: whatever was retrieved, an unsupported cause must not
    // produce a mutating action, and no cause may cite a runbook.
    const contract = checkContract(incident);
    if (contract) return contract;
    return null;
  }

  if (scenario === 'unauthorized-approver') {
    const body = await fire(ALARM);
    const { incident } = body;
    if (!incident) return noIncident(body);
    const refused = await post('/api/approve', { id: incident.id }, OUTSIDER);
    if (refused.status !== 403) {
      return `an unauthorized actor got ${refused.status}, expected 403`;
    }
    const audit = await (
      await fetch(`${BASE}/api/audit?id=${incident.id}`)
    ).json();
    if (
      !audit.some(
        (entry) => entry.actor === OUTSIDER && entry.outcome === 'refused',
      )
    ) {
      return 'the refused approval was not audited against the actor who attempted it';
    }
    const after = await (await fetch(`${BASE}/api/incidents`)).json();
    if (after.incidents[0].status !== 'awaiting-approval') {
      return 'a refused approval changed the incident state';
    }
    return null;
  }

  if (scenario === 'expiry') {
    const body = await fire(ALARM);
    const { incident } = body;
    if (!incident) return noIncident(body);
    const expired = await (
      await post('/api/force-expiry', { id: incident.id })
    ).json();
    if (expired.status !== 'escalated') {
      return `expected escalation, got ${expired.status}`;
    }
    if (expired.executionOutput) {
      return 'expiry executed the action; it must escalate to a human instead';
    }
    if (!expired.escalatedTo) return 'escalation named no target';
    const stale = await post(
      '/api/approve',
      { id: incident.id },
      expired.service.onCall ?? ONCALL_FALLBACK,
    );
    if (stale.status !== 409) {
      return `approving an escalated proposal returned ${stale.status}, expected 409`;
    }
    return null;
  }

  if (scenario === 'unregistered-action') {
    if (!process.env.GLEAN_AGENT_ID) {
      return {
        skip: 'no GLEAN_AGENT_ID, so the agent-orchestrated path cannot be exercised',
      };
    }
    const { incident, refused } = await fire(ALARM, 'agent');
    // Either the agent named a registered action (card offered) or it did not
    // (refused). Both are acceptable; offering an unregistered action is not.
    if (refused) {
      if (!/not pre-registered/.test(refused)) {
        return `unexpected refusal reason: ${refused}`;
      }
      return null;
    }
    if (!incident) return 'no incident and no refusal';
    const known = await (await fetch(`${BASE}/api/config`)).json();
    const ids = known.actions.map((action) => action.id);
    if (!ids.includes(incident.proposed?.actionId)) {
      return `an unregistered action "${incident.proposed?.actionId}" was offered for approval`;
    }
    return checkContract(incident);
  }

  // Unreachable: scenarioFor throws on an unknown query and every scenario above
  // returns. Kept so a new SCENARIOS entry without a branch fails loudly.
  return `no assertion implemented for scenario: ${scenario}`;
}
