// Confidence classification — the reviewer's triage signal.
//
// "Confidence" here is a statement about EVIDENCE, not about the model's
// certainty. A fluent answer with no supporting citation is the most dangerous
// output this app can produce, so fluency is deliberately not an input.
//
// Two independent axes, because collapsing them produces confident nonsense:
//
//   topicality -> does the cited document actually discuss this question?
//                 measured by term overlap against the cited title + snippet
//   approval   -> is that document cleared to be quoted to a customer?
//                 declared in approved-sources.ts, never inferred
//
// strong -> at least one APPROVED citation that addresses the question directly
// weak   -> citations exist, but they are only adjacent, or they are internal
//           documents that a person must clear before the claim leaves the building
// none   -> nothing retrieved, or nothing citable. Never render a draft answer.
//
// Limitation, stated plainly: term overlap is a proxy for topicality. It will call
// a citation "adjacent" when a document uses different vocabulary for the same
// control. The bias is intentional — a false "weak" costs a reviewer thirty
// seconds, a false "strong" ships an unverified claim to a customer.

import { normalizeTokens } from './questionnaire.ts';
import { classifySource, describeSourceClass } from './approved-sources.ts';

export type Confidence = 'strong' | 'weak' | 'none';

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface Classified {
  confidence: Confidence;
  /** True when the row must go to a human expert instead of shipping an answer. */
  needsSme: boolean;
  reason: string;
  citations: Citation[];
  /**
   * The answer text the row may display, which is not always the answer the
   * model produced.
   *
   * classify() owns this rather than returning a verdict for the caller to apply
   * alongside the raw answer. Two callers assigned `row.answer = answer` before
   * checking `needsSme`, so an ungrounded row kept the model's prose and its
   * citations -- the exact failure this recipe argues against, reintroduced by
   * the code that reports it. Enforcing it here means no caller can get it wrong.
   *
   * The offline fixtures hid this: the recorded reply for the attachment request
   * is literally INSUFFICIENT_EVIDENCE, which normalises to empty, so the
   * contract appeared to hold. On a real instance that question retrieves a
   * vulnerability-management policy and Chat answers it in fluent prose.
   */
  answer: string;
}

/** Overlap of question terms present in the cited document's text. */
export const DIRECT_OVERLAP_THRESHOLD = 0.34;

export function citationOverlap(question: string, citation: Citation): number {
  const questionTerms = normalizeTokens(question);
  if (questionTerms.size === 0) return 0;
  const documentTerms = normalizeTokens(
    `${citation.title} ${citation.snippet ?? ''}`,
  );
  let shared = 0;
  for (const term of questionTerms) if (documentTerms.has(term)) shared += 1;
  return shared / questionTerms.size;
}

/**
 * Questions that request an artifact rather than an assertion. No amount of
 * retrieval makes "attach your latest scan report" answerable in prose, so these
 * route to a human regardless of what came back.
 */
const EVIDENCE_REQUEST =
  /\b(attach|upload|provide a copy|send us your|share your)\b/iu;

export function classify(
  question: string,
  answer: string,
  citations: Citation[],
  /**
   * Injectable so the threshold can be pinned by a test rather than only
   * exercised at its current value. The strong/weak split is the judgement this
   * whole app turns on, and nothing else in the suite would notice it moving.
   */
  threshold: number = DIRECT_OVERLAP_THRESHOLD,
): Classified {
  if (EVIDENCE_REQUEST.test(question)) {
    return {
      confidence: 'none',
      needsSme: true,
      reason:
        'Requests an artifact, not an answer. A document has to be attached by a person.',
      // Deliberately dropped. A question asking for a file will still retrieve
      // topical policy documents, and answering it in prose is how an unattached
      // artifact becomes a claim nobody verified.
      citations: [],
      answer: '',
    };
  }

  if (citations.length === 0) {
    return {
      confidence: 'none',
      needsSme: true,
      reason:
        'Retrieval returned no citable source. Answering from model knowledge alone is exactly the failure this app exists to prevent.',
      citations,
      answer: '',
    };
  }

  if (answer.trim().length === 0) {
    return {
      confidence: 'none',
      needsSme: true,
      reason: 'No answer text was produced.',
      citations,
      answer: '',
    };
  }

  const scored = citations.map((citation) => ({
    citation,
    overlap: citationOverlap(question, citation),
    sourceClass: classifySource(citation.url),
  }));

  const approved = scored.filter((entry) => entry.sourceClass === 'approved');
  const bestApproved = approved.length
    ? Math.max(...approved.map((entry) => entry.overlap))
    : 0;

  if (bestApproved >= threshold) {
    return {
      confidence: 'strong',
      needsSme: false,
      reason: `Approved source addresses the question directly (term overlap ${bestApproved.toFixed(2)}).`,
      citations,
      answer,
    };
  }

  const bestOverall = Math.max(...scored.map((entry) => entry.overlap));
  const topical = scored.find((entry) => entry.overlap === bestOverall);

  // On-topic but not clearable is the most misleading case, so name it explicitly
  // rather than reporting a bare score the reviewer has to interpret.
  if (
    topical &&
    topical.sourceClass !== 'approved' &&
    bestOverall >= threshold
  ) {
    return {
      confidence: 'weak',
      needsSme: false,
      reason: `On topic, but the best source is ${describeSourceClass(topical.sourceClass)} ("${topical.citation.title}"). A person must clear this before it goes to the customer.`,
      citations,
      answer,
    };
  }

  return {
    confidence: 'weak',
    needsSme: false,
    reason: `Citations are only topically adjacent (best term overlap ${bestOverall.toFixed(2)}). Verify before sending.`,
    citations,
    answer,
  };
}
