// Approved-evidence policy.
//
// Topicality and approval are different questions, and conflating them is how an
// internal IT wiki page ends up cited in a customer's security questionnaire.
//
//   "Describe your self-service credential reset flow."
//   cited: "SSO and Password Reset" (internal support article)
//
// That citation is topically excellent — it is literally about credential resets —
// and completely unsuitable as external evidence. It is internal operational
// guidance, not a reviewed statement of a security control. A term-overlap score
// cannot tell the difference, because the difference isn't linguistic.
//
// So approval is declared, not inferred. This list is the app's answer to "only
// permitted, approved evidence enters the prompt": a customer would own it, and it
// is the kind of thing that belongs in review with their security team rather than
// in a heuristic.

/** URL prefixes whose content is cleared for customer-facing use. */
const APPROVED_PREFIXES = [
  'https://portal.sample.internal/sales/accounts/',
  'https://portal.sample.internal/legal/',
  'https://portal.sample.internal/security/',
];

/**
 * Topically relevant but not cleared for external use. Kept explicit rather than
 * treated as a default-deny bucket so the reason surfaced to the reviewer can say
 * *why* a citation was downgraded.
 */
const INTERNAL_PREFIXES = [
  'https://portal.sample.internal/support/',
  'https://portal.sample.internal/engineering/',
  'https://portal.sample.internal/hr/',
];

export type SourceClass = 'approved' | 'internal' | 'unknown';

export function classifySource(url: string): SourceClass {
  if (APPROVED_PREFIXES.some((prefix) => url.startsWith(prefix)))
    return 'approved';
  if (INTERNAL_PREFIXES.some((prefix) => url.startsWith(prefix)))
    return 'internal';
  return 'unknown';
}

export function describeSourceClass(sourceClass: SourceClass): string {
  switch (sourceClass) {
    case 'approved':
      return 'approved for customer-facing use';
    case 'internal':
      return 'internal documentation, not cleared for external use';
    default:
      return 'source not on the approved list';
  }
}
