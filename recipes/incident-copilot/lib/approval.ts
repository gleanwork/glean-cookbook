// The approval gate.
//
// "Human-in-the-loop is non-negotiable — the approval gate, expiry/escalation, and
// audit log must be real, not decorative." So each of those is a thing that can
// refuse you:
//
//   - An actor who is not the on-call engineer or a service owner gets 403. The
//     allowed set comes from the service catalog, not from a config file.
//   - A proposal that is not approved within the window escalates, on a timer, to
//     the escalation target the catalog names. Nothing is executed on expiry;
//     escalation is a handoff, not an auto-approve. Auto-approving on timeout would
//     invert the entire point of a gate.
//   - Approving twice, approving something already escalated, or approving an
//     action that is not registered all fail loudly and get audited.
//
// One rule here is not in the ticket and was added because building it made the
// gap obvious: a *mutating* action requires an evidence-supported cause. You
// cannot draft a fix for a cause nobody has established. Without this, an alarm
// with no matching precedent still produced a "draft fix PR" card, because the
// deploy runbook mentions rollbacks -- which is precisely the relevance-is-not-
// evidence mistake the rest of the recipe is built to avoid, reappearing one layer
// down in the action choice. It is enforced here rather than in either planner, so
// neither can negotiate it away.

import { FALLBACK_ACTION_ID, findAction } from './actions.ts';
import { mayApprove, approvers } from './registry.ts';
import {
  get,
  post,
  record,
  type Incident,
  type ProposedAction,
} from './state.ts';

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const timers = new Map<string, NodeJS.Timeout>();

/**
 * The approval window for an incident, in milliseconds.
 *
 * Read from the service catalog, because the window is a property of the service
 * and not of this process: a checkout service on a 10-minute window and an
 * internal tool on an hour are the same code path with different catalog entries.
 *
 * APPROVAL_EXPIRY_MS is a verification-only override that drives expiry without
 * waiting.
 */
export function expiryMs(incident?: Incident): number {
  const override = process.env.APPROVAL_EXPIRY_MS;
  if (override) return Number(override);
  const minutes = incident?.service.escalateAfterMinutes;
  return (minutes && minutes > 0 ? minutes : 30) * 60 * 1000;
}

export function arm(incident: Incident): void {
  disarm(incident.id);
  const ms = expiryMs(incident);
  incident.expiresAt = new Date(Date.now() + ms).toISOString();
  const timer = setTimeout(() => escalate(incident.id), ms);
  // Never hold the process open just to wait for an escalation.
  timer.unref?.();
  timers.set(incident.id, timer);
}

export function disarm(incidentId: string): void {
  const timer = timers.get(incidentId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(incidentId);
  }
}

/** Exported so verification can drive expiry deterministically. */
export function escalate(incidentId: string): void {
  const incident = get(incidentId);
  disarm(incidentId);
  if (incident.status !== 'awaiting-approval') return;

  incident.status = 'escalated';
  incident.escalatedTo = incident.service.escalateTo;
  post(incident, {
    kind: 'escalation',
    text:
      `No approval within ${Math.round(expiryMs(incident) / 60000)} min. Escalated to ` +
      `${incident.escalatedTo}. The proposed action was NOT executed.`,
  });
  record({
    incidentId,
    actor: 'system',
    action: incident.proposed?.actionId ?? 'none',
    outcome: 'escalated',
    detail: `expired unapproved; handed to ${incident.escalatedTo}`,
  });
}

export interface GateOutcome {
  /** Set when policy replaced the planner's choice. Always surfaced, never silent. */
  substituted?: { from: string; to: string; why: string };
}

export function awaitApproval(
  incident: Incident,
  proposed: ProposedAction,
): GateOutcome {
  if (!findAction(proposed.actionId)) {
    // Refuse at proposal time, not at execution time: a card offering an action
    // that cannot run is a card that lies to the approver.
    record({
      incidentId: incident.id,
      actor: incident.orchestrator === 'agent' ? 'glean-agent' : 'app',
      action: proposed.actionId,
      outcome: 'refused',
      detail: 'not a pre-registered action',
    });
    throw new ApprovalError(
      `Proposed action "${proposed.actionId}" is not pre-registered. Refusing to offer it.`,
      422,
    );
  }

  const outcome: GateOutcome = {};

  // A mutating action needs a cause somebody can point at.
  const action = findAction(proposed.actionId);
  const supported = incident.hypotheses.some(
    (hypothesis) => hypothesis.confidence === 'supported',
  );
  if (action?.mutates && !supported) {
    const why =
      `${action.label} changes code or config, and no past incident supports a cause ` +
      'for this alarm. Downgraded to filing a ticket so a person decides.';
    record({
      incidentId: incident.id,
      actor: incident.orchestrator === 'agent' ? 'glean-agent' : 'app',
      action: proposed.actionId,
      outcome: 'refused',
      detail: why,
    });
    post(incident, { kind: 'failure', text: why });
    outcome.substituted = {
      from: proposed.actionId,
      to: FALLBACK_ACTION_ID,
      why,
    };
    proposed = { ...proposed, actionId: FALLBACK_ACTION_ID };
  }

  incident.proposed = proposed;
  incident.status = 'awaiting-approval';
  arm(incident);
  post(incident, {
    kind: 'approval',
    text:
      `Proposed: ${findAction(proposed.actionId)?.label}. Awaiting approval from ` +
      `${approvers(incident.service).join(' or ')} by ${incident.expiresAt}.`,
  });
  record({
    incidentId: incident.id,
    actor: incident.orchestrator === 'agent' ? 'glean-agent' : 'app',
    action: proposed.actionId,
    outcome: 'requested',
  });
  return outcome;
}

function assertActionable(incident: Incident, actor: string): void {
  if (!mayApprove(incident.service, actor)) {
    record({
      incidentId: incident.id,
      actor,
      action: incident.proposed?.actionId ?? 'none',
      outcome: 'refused',
      detail: 'actor is not on-call or a service owner',
    });
    throw new ApprovalError(
      `${actor} is not on call for ${incident.service.service} and does not own it. ` +
        `Approval is restricted to ${approvers(incident.service).join(', ')}.`,
      403,
    );
  }
  if (incident.status === 'escalated') {
    throw new ApprovalError(
      'This proposal expired and was escalated. Re-triage rather than approving a stale action.',
      409,
    );
  }
  if (incident.status !== 'awaiting-approval') {
    throw new ApprovalError(
      `Incident is ${incident.status}; nothing is awaiting approval.`,
      409,
    );
  }
}

export async function approve(
  incidentId: string,
  actor: string,
  edited?: { summary?: string; detail?: string; simulateFailure?: string },
): Promise<Incident> {
  const incident = get(incidentId);
  assertActionable(incident, actor);
  const proposed = incident.proposed;
  if (!proposed) throw new ApprovalError('Nothing proposed.', 409);

  disarm(incidentId);

  if (edited?.summary && edited.summary !== proposed.summary) {
    proposed.summary = edited.summary;
    incident.editedBy = actor;
  }
  if (edited?.detail && edited.detail !== proposed.detail) {
    proposed.detail = edited.detail;
    incident.editedBy = actor;
  }

  incident.status = 'approved';
  incident.approvedBy = actor;
  record({
    incidentId,
    actor,
    action: proposed.actionId,
    outcome: 'approved',
    detail: incident.editedBy
      ? 'approved after editing the proposal'
      : undefined,
  });

  const action = findAction(proposed.actionId);
  if (!action) {
    // Defence in depth: the registry could have changed between propose and
    // approve. Never execute something that is no longer registered.
    incident.status = 'action-failed';
    record({
      incidentId,
      actor,
      action: proposed.actionId,
      outcome: 'refused',
      detail: 'action de-registered between proposal and approval',
    });
    throw new ApprovalError('Action is no longer registered.', 409);
  }

  const result = await action.run({
    incidentId,
    service: incident.service.service,
    summary: proposed.summary,
    detail: proposed.detail,
    simulateFailure: edited?.simulateFailure,
  });

  incident.executionOutput = result.output;
  if (result.ok) {
    incident.status = 'executed';
    post(incident, {
      kind: 'execution',
      text: `${action.label} executed by ${actor}: ${result.output}`,
    });
    record({
      incidentId,
      actor,
      action: proposed.actionId,
      outcome: 'executed',
      detail: result.output,
    });
  } else {
    incident.status = 'action-failed';
    post(incident, {
      kind: 'failure',
      text: `${action.label} FAILED: ${result.output}`,
    });
    record({
      incidentId,
      actor,
      action: proposed.actionId,
      outcome: 'failed',
      detail: result.output,
    });
  }
  return incident;
}

export function reject(
  incidentId: string,
  actor: string,
  why: string,
): Incident {
  const incident = get(incidentId);
  assertActionable(incident, actor);
  disarm(incidentId);
  incident.status = 'rejected';
  post(incident, { kind: 'approval', text: `Rejected by ${actor}: ${why}` });
  record({
    incidentId,
    actor,
    action: incident.proposed?.actionId ?? 'none',
    outcome: 'rejected',
    detail: why,
  });
  return incident;
}
