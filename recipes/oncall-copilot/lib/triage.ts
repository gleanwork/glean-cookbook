// Triage: fan out retrieval, classify what came back, and assemble the card.
//
// Shared by both orchestrators. The difference between them is who decides *what
// to retrieve and how to summarise it*; the evidence rules are identical either
// way, because they are a property of the corpus, not of the planner.

import { search, type SearchHit } from './platform.ts';
import {
  classify,
  proposeFromProcedure,
  rankCauses,
  type Alarm,
  type ClassifiedHit,
  type Hypothesis,
} from './evidence.ts';
import type { ServiceRecord } from './registry.ts';

export interface TriageResult {
  evidence: ClassifiedHit[];
  hypotheses: Hypothesis[];
  procedure?: ClassifiedHit;
}

/**
 * The fan-out the sheet asks for: runbook sections, similar past incidents, recent
 * merges, related tickets, active threads. Each leg is a separate query so a corpus
 * missing one source degrades that leg instead of poisoning the whole ranking.
 */
export function fanOutQueries(alarm: Alarm, service: ServiceRecord): string[] {
  return [
    `${alarm.service} ${alarm.kind} runbook`,
    `${alarm.service} incident review ${alarm.metric}`,
    `${alarm.service} deploy rollback`,
    `${alarm.service} architecture dependencies`,
    `${service.escalateTo} ${alarm.service} on-call rotation`,
  ];
}

export async function triage(
  alarm: Alarm,
  service: ServiceRecord,
): Promise<TriageResult> {
  const legs = fanOutQueries(alarm, service);
  const settled = await Promise.allSettled(legs.map((query) => search(query)));

  const hits: SearchHit[] = [];
  for (const outcome of settled) {
    // A failed leg is a gap, not a stop. The card reports what it had.
    if (outcome.status === 'fulfilled') hits.push(...outcome.value);
  }

  const evidence = classify(alarm, hits);
  return {
    evidence,
    hypotheses: rankCauses(alarm, evidence),
    procedure: proposeFromProcedure(evidence),
  };
}

/** Human-readable summary of what the evidence does and does not support. */
export function describeEvidence(result: TriageResult): string {
  const counts = { precedent: 0, procedure: 0, context: 0 };
  for (const hit of result.evidence) counts[hit.role] += 1;
  const supported = result.hypotheses.filter(
    (hypothesis) => hypothesis.confidence === 'supported',
  ).length;
  return (
    `${counts.precedent} precedent, ${counts.procedure} procedure, ${counts.context} context; ` +
    (supported > 0
      ? `${supported} cause supported by a matching past incident.`
      : 'no past incident matches this signature, so no cause is claimed.')
  );
}
