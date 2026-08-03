// Evidentiary role, and why relevance is not evidence.
//
// The ticket asks for "probable cause ranked by evidence." The obvious reading is
// "rank the retrieved documents by relevance and explain the top one." That
// produces confident wrong root causes, for a structural reason:
//
// A canary alarm on payments-service retrieves the deploy-and-rollback runbook at
// or near the top of every ranking, because that runbook is *dense* with the
// alarm's own vocabulary — canary, rollout, error rate, authorization failure
// rate, rollback. It is the most relevant document in the corpus. It also contains
// no information whatsoever about why *this* deploy broke. It is procedure.
//
// So documents are classified by the role they can play in an argument:
//
//   precedent - a past incident with a matching signature. The only kind of
//               document that can support a claim about cause, because it is the
//               only kind that records a cause.
//   procedure - a runbook. Supports a proposed *action*. Never a cause.
//   context   - service catalog, rotation, architecture. Supports who owns it and
//               what it talks to. Never a cause.
//
// When no precedent matches, the card says so and proposes a procedure-backed
// containment step instead of naming a cause. An on-call engineer at 3am is
// exactly the wrong audience for a confident guess.

import type { SearchHit } from './platform.ts';

export type EvidenceRole = 'precedent' | 'procedure' | 'context';

export interface ClassifiedHit extends SearchHit {
  role: EvidenceRole;
  /** How much of the alarm's distinguishing signature this document shares. */
  signatureMatch: number;
}

export interface Alarm {
  id: string;
  service: string;
  /** e.g. "canary" — the alarm family, not the free-text summary. */
  kind: string;
  metric: string;
  summary: string;
  severity: 'Sev1' | 'Sev2' | 'Sev3';
  firedAt: string;
}

export interface Hypothesis {
  cause: string;
  confidence: 'supported' | 'weak';
  /** Documents that actually license this claim. Precedents only. */
  evidence: ClassifiedHit[];
  reason: string;
}

/**
 * Role is derived from where a document lives, not from what it says. A doc's
 * evidentiary role is a property of the corpus's own organisation, and guessing it
 * from prose is exactly the inference this module exists to avoid. A real
 * deployment would map its own document types here.
 */
export function classifyRole(hit: SearchHit): EvidenceRole {
  const url = hit.url;
  if (url.includes('/incidents/')) return 'precedent';
  if (url.includes('/runbooks/')) return 'procedure';
  return 'context';
}

const NOISE = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'was',
  'were',
  'with',
  'service',
  'alarm',
]);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/gu, ' ')
      .split(/[\s-]+/u)
      .filter((token) => token.length > 2 && !NOISE.has(token)),
  );
}

/**
 * Fraction of the alarm's distinguishing terms that appear in the document.
 * Deliberately built from the structured alarm fields plus its summary, not from
 * the whole payload, so boilerplate in the webhook body cannot inflate a match.
 */
export function signatureMatch(alarm: Alarm, hit: SearchHit): number {
  const signature = terms(
    `${alarm.service} ${alarm.kind} ${alarm.metric} ${alarm.summary}`,
  );
  if (signature.size === 0) return 0;
  const document = terms(`${hit.title} ${hit.snippet}`);
  let shared = 0;
  for (const term of signature) if (document.has(term)) shared += 1;
  return shared / signature.size;
}

/** A precedent must look like the same failure, not merely the same service. */
export const PRECEDENT_THRESHOLD = 0.3;

export function classify(alarm: Alarm, hits: SearchHit[]): ClassifiedHit[] {
  const seen = new Set<string>();
  return hits
    .filter((hit) => {
      if (seen.has(hit.url)) return false;
      seen.add(hit.url);
      return true;
    })
    .map((hit) => ({
      ...hit,
      role: classifyRole(hit),
      signatureMatch: signatureMatch(alarm, hit),
    }));
}

/**
 * Builds ranked hypotheses. Only precedents can license a cause, so an empty
 * result is a real and correct outcome, not a bug: it means nothing in the corpus
 * records this failure happening before.
 */
export function rankCauses(
  alarm: Alarm,
  classified: ClassifiedHit[],
): Hypothesis[] {
  const precedents = classified
    .filter((hit) => hit.role === 'precedent')
    .sort((a, b) => b.signatureMatch - a.signatureMatch);

  return precedents.map((precedent) => {
    const matching = precedent.signatureMatch >= PRECEDENT_THRESHOLD;
    return {
      cause: precedent.title,
      confidence: matching ? 'supported' : 'weak',
      evidence: [precedent],
      reason: matching
        ? `Past incident shares ${(precedent.signatureMatch * 100).toFixed(0)}% of this alarm's signature, and records a root cause.`
        : `Same service, but only ${(precedent.signatureMatch * 100).toFixed(0)}% signature overlap — probably a different failure. Read before trusting.`,
    };
  });
}

/**
 * The proposed action comes from procedure, never from a precedent's narrative.
 * A past fix describes what someone did to a different instance of the problem;
 * the runbook describes what this system supports doing right now.
 */
export function proposeFromProcedure(
  classified: ClassifiedHit[],
): ClassifiedHit | undefined {
  return classified
    .filter((hit) => hit.role === 'procedure')
    .sort((a, b) => b.signatureMatch - a.signatureMatch)[0];
}
