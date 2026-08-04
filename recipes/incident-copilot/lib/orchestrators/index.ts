// Two orchestrators, one shell.
//
// The ticket asks for a dual implementation: "one that uses Agent API for
// retrieving an agent built in Glean and another that does not." Steven's sheet
// adds that both variants render into one shell, so this is a strategy switch
// rather than two copies of the app. That keeps the interesting difference — who
// owns planning — visible, instead of burying it in duplicated server plumbing.
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
