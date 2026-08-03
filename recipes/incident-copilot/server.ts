import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Alarm } from './lib/evidence.ts';
import { resolve, approvers, mayApprove } from './lib/registry.ts';
import { describeEvidence } from './lib/triage.ts';
import { appOrchestrated } from './lib/orchestrators/app-orchestrated.ts';
import { gleanAgent } from './lib/orchestrators/glean-agent.ts';
import type { Orchestrator } from './lib/orchestrators/index.ts';
import {
  ApprovalError,
  approve,
  awaitApproval,
  escalate,
  expiryMs,
  reject,
} from './lib/approval.ts';
import { actionCatalog } from './lib/actions.ts';
import { draft } from './lib/postmortem.ts';
import * as store from './lib/state.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Who is acting. IMPORTANT: this is *asserted*, not authenticated — the header is a
 * demo affordance so you can watch the gate refuse you without restarting anything.
 *
 * The recipe implements authorization (who may approve, read from the service
 * catalog) and deliberately does not implement authentication (proving you are that
 * person). Those are different problems and a real deployment must solve the second
 * one before trusting the first. Shipping this header as-is would mean anyone can
 * claim to be the on-call engineer.
 */
function actorOf(req: http.IncomingMessage): string {
  const asserted = req.headers['x-incident-actor'];
  if (typeof asserted === 'string' && asserted.length > 0) return asserted;
  return process.env.INCIDENT_ACTOR ?? 'marcus.webb@sample.example.com';
}

const ORCHESTRATORS: Orchestrator[] = [appOrchestrated, gleanAgent];

function pick(id: string | null): Orchestrator {
  const chosen = ORCHESTRATORS.find((orchestrator) => orchestrator.id === id);
  if (chosen && chosen.available()) return chosen;
  return appOrchestrated;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve_, reject_) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve_((raw ? JSON.parse(raw) : {}) as T);
      } catch (error) {
        reject_(error);
      }
    });
    req.on('error', reject_);
  });
}

/**
 * Severity/service filters, applied before anything else runs. An incident copilot
 * that wakes up for every Sev3 is an incident copilot people mute.
 */
export function passesFilter(alarm: Alarm): boolean {
  const services = (process.env.WATCHED_SERVICES ?? 'payments-service')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const minimum = process.env.MIN_SEVERITY ?? 'Sev2';
  const rank = { Sev1: 1, Sev2: 2, Sev3: 3 } as const;
  return (
    services.includes(alarm.service) &&
    rank[alarm.severity] <= rank[minimum as keyof typeof rank]
  );
}

async function handleWebhook(
  alarm: Alarm,
  orchestratorId: string | null,
): Promise<{ status: number; body: unknown }> {
  if (!passesFilter(alarm)) {
    return {
      status: 202,
      body: {
        filtered: true,
        reason: `${alarm.service} at ${alarm.severity} does not match the configured filters.`,
      },
    };
  }

  const service = await resolve(alarm.service);
  const orchestrator = pick(orchestratorId);

  const incident: store.Incident = {
    id: alarm.id,
    alarm,
    service,
    status: 'acknowledged',
    orchestrator: orchestrator.id,
    evidence: [],
    hypotheses: [],
    channel: [],
    createdAt: new Date().toISOString(),
  };
  store.put(incident);

  // Step 1: acknowledge first, so the channel knows a human is not alone yet.
  store.post(incident, {
    kind: 'ack',
    text:
      `Ack ${alarm.id} on ${alarm.service} (${alarm.severity}). On call: ${service.onCall}. ` +
      `Triaging via ${orchestrator.label}.`,
  });

  const outcome = await orchestrator.run(alarm, service);
  incident.evidence = outcome.triage.evidence;
  incident.hypotheses = outcome.triage.hypotheses;
  store.post(incident, {
    kind: 'triage',
    text: `${describeEvidence(outcome.triage)} ${outcome.notes.join(' ')}`.trim(),
  });

  try {
    const gate = awaitApproval(incident, outcome.proposed);
    if (gate.substituted) outcome.notes.push(gate.substituted.why);
  } catch (error) {
    if (error instanceof ApprovalError) {
      // A refused proposal is a real outcome: the card is not offered, the
      // incident stays acknowledged, and the channel is told why.
      store.post(incident, { kind: 'failure', text: error.message });
      return {
        status: 200,
        body: { incident, refused: error.message, notes: outcome.notes },
      };
    }
    throw error;
  }

  return { status: 200, body: { incident, notes: outcome.notes } };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (
      req.method === 'GET' &&
      (url.pathname === '/' || url.pathname === '/index.html')
    ) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      json(res, 200, {
        actor: actorOf(req),
        expiryMs: expiryMs(),
        actions: actionCatalog(),
        orchestrators: ORCHESTRATORS.map((orchestrator) => ({
          id: orchestrator.id,
          label: orchestrator.label,
          available: orchestrator.available(),
        })),
        fixtureMode: process.env.GLEAN_USE_FIXTURE === 'true',
        impersonation: false,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/sample-alarm') {
      json(
        res,
        200,
        JSON.parse(
          fs.readFileSync(
            path.join(__dirname, 'fixtures', 'pagerduty-alarm.json'),
            'utf8',
          ),
        ),
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/webhook/pagerduty') {
      const alarm = await readBody<Alarm>(req);
      const { status, body } = await handleWebhook(
        alarm,
        url.searchParams.get('orchestrator'),
      );
      json(res, status, body);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/incidents') {
      json(res, 200, {
        incidents: store.list(),
        approvers: store.list().map((incident) => ({
          id: incident.id,
          allowed: approvers(incident.service),
          youMayApprove: mayApprove(incident.service, actorOf(req)),
        })),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/approve') {
      const body = await readBody<{
        id: string;
        summary?: string;
        detail?: string;
        simulateFailure?: string;
      }>(req);
      json(res, 200, await approve(body.id, actorOf(req), body));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reject') {
      const body = await readBody<{ id: string; why?: string }>(req);
      json(
        res,
        200,
        reject(body.id, actorOf(req), body.why ?? 'no reason given'),
      );
      return;
    }

    // Exposed so the expiry path is demonstrable without waiting out the clock.
    if (req.method === 'POST' && url.pathname === '/api/force-expiry') {
      const body = await readBody<{ id: string }>(req);
      escalate(body.id);
      json(res, 200, store.get(body.id));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/postmortem') {
      const body = await readBody<{ id: string }>(req);
      const incident = store.get(body.id);
      incident.postmortem = await draft(incident);
      incident.status = 'resolved';
      json(res, 200, incident);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/audit') {
      json(res, 200, store.auditLog(url.searchParams.get('id') ?? undefined));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      store.reset();
      json(res, 200, { ok: true });
      return;
    }

    res.writeHead(404);
    res.end();
  } catch (error) {
    if (error instanceof ApprovalError) {
      json(res, error.status, { error: error.message });
      return;
    }
    json(res, 500, { error: (error as Error).message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Incident copilot running at http://localhost:${port}`);
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    console.log('Fixture mode: no credentials used, no network calls made.');
  }
});
