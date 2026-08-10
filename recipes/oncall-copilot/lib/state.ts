// Incident state and the audit log.
//
// In-process, because the recipe should run with no infrastructure. The shapes are
// the part worth copying; a deployment would put them behind a store whose writes
// are durable, since an audit log you can lose by restarting a process is not an
// audit log.

import type { Alarm, ClassifiedHit, Hypothesis } from './evidence.ts';
import type { ServiceRecord } from './registry.ts';

export type IncidentStatus =
  | 'acknowledged'
  | 'awaiting-approval'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'executed'
  | 'action-failed'
  | 'resolved';

export interface ProposedAction {
  actionId: string;
  summary: string;
  detail: string;
  /** Runbook citation that licenses this action, if any. */
  basis?: { title: string; url: string };
}

export interface Incident {
  id: string;
  alarm: Alarm;
  service: ServiceRecord;
  status: IncidentStatus;
  orchestrator: 'app' | 'agent';
  evidence: ClassifiedHit[];
  hypotheses: Hypothesis[];
  proposed?: ProposedAction;
  /** Set when the approver edited the proposal before approving. */
  editedBy?: string;
  approvedBy?: string;
  expiresAt?: string;
  escalatedTo?: string;
  executionOutput?: string;
  postmortem?: string;
  channel: ChannelPost[];
  createdAt: string;
}

/** Stand-in for the on-call Slack channel, so acks and failures are observable. */
export interface ChannelPost {
  at: string;
  kind: 'ack' | 'triage' | 'approval' | 'execution' | 'failure' | 'escalation';
  text: string;
}

export interface AuditEntry {
  at: string;
  incidentId: string;
  actor: string;
  action: string;
  outcome:
    | 'requested'
    | 'approved'
    | 'rejected'
    | 'executed'
    | 'failed'
    | 'refused'
    | 'escalated';
  detail?: string;
}

const incidents = new Map<string, Incident>();
const audit: AuditEntry[] = [];

export function put(incident: Incident): void {
  incidents.set(incident.id, incident);
}

export function get(id: string): Incident {
  const incident = incidents.get(id);
  if (!incident) throw new Error(`Unknown incident: ${id}`);
  return incident;
}

export function list(): Incident[] {
  return [...incidents.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function post(incident: Incident, post: Omit<ChannelPost, 'at'>): void {
  incident.channel.push({ at: new Date().toISOString(), ...post });
}

export function record(entry: Omit<AuditEntry, 'at'>): AuditEntry {
  const full = { at: new Date().toISOString(), ...entry };
  audit.push(full);
  return full;
}

export function auditLog(incidentId?: string): AuditEntry[] {
  return incidentId
    ? audit.filter((entry) => entry.incidentId === incidentId)
    : [...audit];
}

/** Test seam: verification needs a clean slate between scenarios. */
export function reset(): void {
  incidents.clear();
  audit.length = 0;
}
