// Two orchestrators, one shell.
//
// Both variants render in one shell as a strategy switch. This keeps the
// relevant difference — who owns planning — visible without duplicating the
// server and governance plumbing.
//
// Both paths converge on the same evidence rules and the same approval gate. The
// governance is not the planner's to negotiate.

import type { Alarm } from '../evidence.ts';
import type { ServiceRecord } from '../registry.ts';
import type { ProposedAction } from '../state.ts';
import type { TriageResult } from '../triage.ts';

export interface Orchestrated {
  triage: TriageResult;
  proposed: ProposedAction;
  /** How the summary was produced, surfaced in the UI so the two are comparable. */
  planner: string;
  notes: string[];
}

export interface Orchestrator {
  id: 'app' | 'agent';
  label: string;
  available: () => boolean;
  run: (alarm: Alarm, service: ServiceRecord) => Promise<Orchestrated>;
}
