#!/usr/bin/env node
// Verify gate for incident-copilot.
//
// Fixture mode (default) drives the whole flow with no credentials and no network.
// The assertions are about governance rather than output text, because the
// governance is what the recipe claims: an approval gate that refuses the wrong
// actor, an expiry that escalates instead of auto-approving, an action registry the
// planner cannot talk its way out of, and an audit entry for every attempt
// including the refusals.
//
// The evidence assertions are the other half. They pin the property that a runbook
// can never license a claim about cause, and that an alarm with no matching
// precedent yields no asserted cause at all -- checked on a second alarm built
// specifically so the highest-relevance document is the one that must not be used.
//
// GLEAN_USE_FIXTURE=false with real credentials verifies live; grounding-specific
// assertions relax there, since a reader's corpus is not this one.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3311);
const BASE = `http://localhost:${PORT}`;
const useFixture = process.env.GLEAN_USE_FIXTURE !== 'false';

const ONCALL = 'marcus.webb@sample.example.com';
const OWNER = 'priya.natarajan@sample.example.com';
const OUTSIDER = 'alex.kim@sample.example.com';

const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
};

const alarm = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, 'fixtures', file), 'utf8'));

// One server for the whole run. An earlier version restarted it to change the
// acting user, which quietly did not work: `npx` forwards SIGTERM to itself and
// leaves the tsx child listening, so the next `waitUp()` connected to the *previous*
// server and every authorization assertion passed against the wrong process. The
// actor is a per-request header instead, and the process group is killed properly.
function boot(env = {}) {
  const child = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      GLEAN_USE_FIXTURE: String(useFixture),
      INCIDENT_ACTOR: ONCALL,
      // Per-request actors and forced failures are demo affordances now, refused
      // unless this is set. One scenario below deliberately unsets it.
      INCIDENT_DEMO_MODE: 'true',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c));
  child.getStderr = () => stderr;
  return child;
}

function shutdown(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitUp(base = BASE) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/api/config`)).ok) return true;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const post = (p, body, actor) =>
  fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { 'X-Incident-Actor': actor } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

const fire = (a, orchestrator = 'app') =>
  post(`/webhook/pagerduty?orchestrator=${orchestrator}`, a);

const audit = async (id) => (await fetch(`${BASE}/api/audit?id=${id}`)).json();

const incident = async (id) =>
  (await (await fetch(`${BASE}/api/incidents`)).json()).incidents.find(
    (i) => i.id === id,
  );

const reset = () => post('/api/reset');

async function main() {
  const child = boot();
  try {
    if (!(await waitUp())) {
      check('server starts', false, child.getStderr());
      return;
    }
    check('server starts', true);

    const config = await (await fetch(`${BASE}/api/config`)).json();
    check(
      'impersonation is not claimed anywhere',
      config.impersonation === false,
    );
    check(
      'action registry is closed and advertised',
      config.actions.length === 3,
    );

    // ---- Webhook filtering -------------------------------------------------
    console.log('\nWebhook filtering');
    const sev3 = await fire({
      ...alarm('pagerduty-alarm.json'),
      id: 'PAY-9001',
      severity: 'Sev3',
    });
    check(
      'Sev3 below the threshold is filtered out',
      (await sev3.json()).filtered === true,
    );
    const other = await fire({
      ...alarm('pagerduty-alarm.json'),
      id: 'PAY-9002',
      service: 'growth-service',
    });
    check(
      'unwatched service is filtered out',
      (await other.json()).filtered === true,
    );

    // ---- Triage with a matching precedent ----------------------------------
    console.log('\nTriage: alarm WITH a matching precedent (PAY-2231)');
    const a1 = alarm('pagerduty-alarm.json');
    const r1 = await (await fire(a1)).json();
    const inc1 = r1.incident;
    check('acked before triage', inc1.channel[0]?.kind === 'ack');
    check(
      'service registry resolved the on-call engineer',
      inc1.service.onCall === ONCALL,
    );
    check(
      'service registry resolved the owner',
      inc1.service.techLead === OWNER,
    );
    check(
      'escalation window read from the catalog (12 min, not the 30 min default)',
      inc1.service.escalateAfterMinutes === 12,
    );
    // The parse above proves only that a number was read. This proves the number
    // is the one the timer uses: arm() ignored it for the whole first build, and
    // the assertion could not fail because the catalog, the default and the test
    // override were all 30.
    const windowMin = Math.round(
      (Date.parse(inc1.expiresAt) - Date.parse(inc1.createdAt)) / 60000,
    );
    check(
      'the approval window actually used is the catalog window, not the default',
      windowMin === 12,
    );
    check('reached the approval gate', inc1.status === 'awaiting-approval');
    check('an expiry deadline was set', Boolean(inc1.expiresAt));

    if (useFixture) {
      const supported = inc1.hypotheses.filter(
        (h) => h.confidence === 'supported',
      );
      check(
        'a cause is supported by a matching past incident',
        supported.length === 1,
        JSON.stringify(inc1.hypotheses.map((h) => h.confidence)),
      );
      check(
        'the supported cause cites the precedent, not a runbook',
        supported[0]?.evidence.every((e) => e.role === 'precedent'),
      );
      const runbookHypothesis = inc1.hypotheses.some((h) =>
        h.evidence.some((e) => e.role !== 'precedent'),
      );
      check(
        'no runbook was used to license a claim about cause',
        !runbookHypothesis,
      );
    }

    // ---- Authorization -----------------------------------------------------
    console.log('\nApproval gate: authorization');
    const outsiderTry = await post('/api/approve', { id: inc1.id }, OUTSIDER);
    check(
      'a non-on-call, non-owner actor is refused with 403',
      outsiderTry.status === 403,
      `got ${outsiderTry.status}`,
    );
    const refusal = (await audit(inc1.id)).find(
      (e) => e.outcome === 'refused' && e.actor === OUTSIDER,
    );
    check(
      'the refused approval is audited against that actor',
      Boolean(refusal),
    );
    check(
      'the refusal records why',
      /not on-call or a service owner/.test(refusal?.detail ?? ''),
    );
    check(
      'the incident is still awaiting approval after a refusal',
      (await incident(inc1.id)).status === 'awaiting-approval',
    );
    check(
      'the service owner may approve even when not on call',
      (await (await fetch(`${BASE}/api/incidents`)).json()).approvers
        .find((a) => a.id === inc1.id)
        .allowed.includes(OWNER),
    );

    // ---- Expiry escalates, never auto-approves -----------------------------
    console.log('\nApproval gate: expiry and escalation');
    await reset();
    const r2 = await (await fire(alarm('pagerduty-alarm.json'))).json();
    const expired = await (
      await post('/api/force-expiry', { id: r2.incident.id })
    ).json();
    check('expiry escalates', expired.status === 'escalated');
    check(
      'escalates to the target named in the catalog',
      expired.escalatedTo === OWNER,
    );
    check('expiry does NOT execute the action', !expired.executionOutput);
    check(
      'escalation is audited',
      (await audit(r2.incident.id)).some((e) => e.outcome === 'escalated'),
    );
    check(
      'the channel says the action was not executed',
      expired.channel.some((p) => /NOT executed/.test(p.text)),
    );
    const stale = await post('/api/approve', { id: r2.incident.id }, ONCALL);
    check(
      'approving an escalated proposal is refused with 409',
      stale.status === 409,
      `got ${stale.status}`,
    );

    // ---- Approve, edit, execute -------------------------------------------
    console.log('\nApproval gate: approve with an edit, then execute');
    await reset();
    const r3 = await (await fire(alarm('pagerduty-alarm.json'))).json();
    const edited = await (
      await post(
        '/api/approve',
        {
          id: r3.incident.id,
          summary:
            'payments-service: edited by the on-call engineer before approving',
          detail: r3.incident.proposed.detail,
        },
        ONCALL,
      )
    ).json();
    check(
      'approval executes the action',
      edited.status === 'executed',
      edited.status,
    );
    check('the edit is attributed to the approver', edited.editedBy === ONCALL);
    check('the approver is recorded', edited.approvedBy === ONCALL);
    check('execution output is captured', Boolean(edited.executionOutput));
    const log3 = await audit(r3.incident.id);
    check(
      'audit records request, approval and execution',
      ['requested', 'approved', 'executed'].every((o) =>
        log3.some((e) => e.outcome === o),
      ),
      JSON.stringify(log3.map((e) => e.outcome)),
    );
    check(
      'the audit notes that the proposal was edited',
      log3.some(
        (e) => e.outcome === 'approved' && /edit/i.test(e.detail ?? ''),
      ),
    );
    check(
      'execution posted to the channel',
      edited.channel.some((p) => p.kind === 'execution'),
    );
    const twice = await post('/api/approve', { id: r3.incident.id }, ONCALL);
    check(
      'approving an already-executed incident is refused with 409',
      twice.status === 409,
      `got ${twice.status}`,
    );

    // ---- Action failures are loud -----------------------------------------
    console.log('\nAction failures surface, never silent');
    await reset();
    const r4 = await (await fire(alarm('pagerduty-alarm.json'))).json();
    check(
      'a mutating action was proposed (cause is supported here)',
      r4.incident.proposed.actionId === 'draft-fix-pr',
      r4.incident.proposed.actionId,
    );
    const failed = await (
      await post(
        '/api/approve',
        {
          id: r4.incident.id,
          simulateFailure: 'draft-fix-pr',
        },
        ONCALL,
      )
    ).json();
    check(
      'a failed action is reflected in status',
      failed.status === 'action-failed',
      failed.status,
    );
    check(
      'the failure is posted to the channel',
      failed.channel.some((p) => p.kind === 'failure'),
    );
    check(
      'the failure is audited',
      (await audit(r4.incident.id)).some((e) => e.outcome === 'failed'),
    );
    check(
      'the error text reaches the channel, not just the log',
      failed.channel.some((p) => /503/.test(p.text)),
    );

    // ---- No precedent => no asserted cause, and no mutating action --------
    console.log('\nTriage: alarm with NO matching precedent (PAY-2232)');
    await reset();
    const r5 = await (await fire(alarm('pagerduty-alarm-novel.json'))).json();
    const inc5 = r5.incident;
    if (useFixture) {
      const supported5 = inc5.hypotheses.filter(
        (h) => h.confidence === 'supported',
      );
      check(
        'no cause is asserted when no precedent matches',
        supported5.length === 0,
        JSON.stringify(
          inc5.hypotheses.map((h) => `${h.confidence}:${h.cause}`),
        ),
      );
      const top = inc5.evidence
        .slice()
        .sort((a, b) => b.signatureMatch - a.signatureMatch)[0];
      check(
        'the highest-scoring document here is a runbook, not a precedent',
        top.role === 'procedure',
        `top was ${top.role}: ${top.title}`,
      );
      check(
        'so a relevance-ranked copilot would have blamed a deploy that never happened',
        /deploy|rollback/i.test(top.title),
      );
      check(
        'the triage note says no cause is claimed',
        inc5.channel.some((p) => /no past incident matches/i.test(p.text)),
      );
      check(
        'the mutating action was downgraded, not offered',
        inc5.proposed.actionId === 'file-tracking-ticket',
        inc5.proposed.actionId,
      );
      check(
        'the downgrade is visible in the channel',
        inc5.channel.some((p) => /Downgraded to filing a ticket/.test(p.text)),
      );
      check(
        'the downgrade is audited as a refusal',
        (await audit(inc5.id)).some(
          (e) => e.outcome === 'refused' && e.action === 'draft-fix-pr',
        ),
      );
    }

    // ---- Agent path, including going off-script ---------------------------
    console.log('\nAgent-orchestrated path');
    await reset();
    const r6 = await (
      await fire(alarm('pagerduty-alarm.json'), 'agent')
    ).json();
    check(
      'the agent path reaches the same approval gate',
      r6.incident.status === 'awaiting-approval',
      r6.incident.status,
    );
    check(
      'the agent path is labelled as agent-planned',
      r6.incident.orchestrator === 'agent',
    );
    if (useFixture) {
      check(
        'the agent named a registered action',
        r6.incident.proposed.actionId === 'draft-fix-pr',
        r6.incident.proposed.actionId,
      );
      check(
        'the agent path classifies evidence with the same rules',
        r6.incident.hypotheses.some((h) => h.confidence === 'supported'),
      );
    }

    const offScript = await (
      await fire(
        {
          ...alarm('pagerduty-alarm.json'),
          id: 'PAY-2233',
        },
        'agent',
      )
    ).json();
    if (useFixture) {
      check(
        'an unregistered action is refused, not offered',
        Boolean(offScript.refused),
        JSON.stringify(offScript.refused ?? offScript.incident?.proposed),
      );
      check(
        'the refusal names the action the agent tried to take',
        /rollback-production-now/.test(offScript.refused ?? ''),
      );
      check('no approval card is offered for it', !offScript.incident.proposed);
      check(
        'nothing was executed for the off-script proposal',
        !offScript.incident.executionOutput,
      );
      check(
        'the refusal is audited',
        (await audit('PAY-2233')).some((e) => e.outcome === 'refused'),
      );
    }

    // ---- Postmortem is built from recorded facts --------------------------
    console.log('\nPostmortem');
    const pm = await (
      await post('/api/postmortem', { id: r6.incident.id })
    ).json();
    check(
      'a postmortem draft is produced',
      typeof pm.postmortem === 'string' && pm.postmortem.length > 0,
    );
    check(
      'the draft includes a timeline section',
      /## Timeline/.test(pm.postmortem ?? ''),
    );
    check(
      'the timeline is built from audited events',
      /\[audit\]/.test(pm.postmortem ?? ''),
    );
    check('the incident is resolved after the draft', pm.status === 'resolved');
  } finally {
    shutdown(child);
  }
}

await main();

// The demo affordances must be refused when the flag is unset, on a server booted
// without it. Asserting this on the main server is not possible: everything above
// depends on per-request actors, so it runs with the flag on.
async function checkDemoAffordancesAreOff() {
  const port = PORT + 1;
  const base = `http://localhost:${port}`;
  const child = boot({ PORT: String(port), INCIDENT_DEMO_MODE: '' });
  try {
    if (!(await waitUp(base))) {
      check('second server booted for the demo-mode check', false);
      return;
    }
    const { incident } = await (
      await fetch(`${base}/webhook/pagerduty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alarm('pagerduty-alarm.json')),
      })
    ).json();

    const spoofed = await fetch(`${base}/api/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Incident-Actor': OUTSIDER,
      },
      body: JSON.stringify({ id: incident.id }),
    });
    check(
      'the x-incident-actor header is refused when INCIDENT_DEMO_MODE is unset',
      spoofed.status === 403,
    );
    check(
      'the refusal explains the flag rather than failing opaquely',
      /INCIDENT_DEMO_MODE/u.test(JSON.stringify(await spoofed.json())),
    );

    const forced = await fetch(`${base}/api/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: incident.id,
        simulateFailure: 'draft-fix-pr',
      }),
    });
    check(
      'simulateFailure is refused when INCIDENT_DEMO_MODE is unset',
      forced.status === 403,
    );

    const after = await (await fetch(`${base}/api/incidents`)).json();
    check(
      'a refused demo affordance leaves the incident untouched',
      after.incidents[0].status === 'awaiting-approval',
    );
  } finally {
    shutdown(child);
  }
}

await checkDemoAffordancesAreOff();

console.log('');
if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} check(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('All checks passed.');
