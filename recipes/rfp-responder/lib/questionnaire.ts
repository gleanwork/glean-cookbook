// Questionnaire parsing + deduplication.
//
// Dedup runs BEFORE any Chat call (SPEC-LOCK step 2), so it has to be local and
// lexical: no embeddings, no LLM pass.
//
// We tried scoring token-set similarity and auto-merging above a threshold. On a
// real security questionnaire that is actively unsafe. Measured on
// fixtures/sample-security-questionnaire.csv:
//
//   "Is customer data encrypted at rest?"                     vs
//   "Is customer data encrypted in transit?"        -> 0.60   DIFFERENT CONTROLS
//
//   "Is customer data encrypted at rest?"                     vs
//   "Describe your at-rest encryption, including key length." -> 0.29  SAME QUESTION
//
// The false positive outranks the true positive, because the two questions that
// must never be merged differ by a single token while the two that should be
// merged share almost no vocabulary. Any threshold that catches the real
// duplicate also merges at-rest with in-transit encryption — i.e. tells the
// customer the wrong thing about their own security controls, in writing.
//
// So: auto-merge ONLY normalized-exact matches (the common cross-tab repeat), and
// use similarity purely to ORDER a manual-merge candidate list for the reviewer.
// The score is never a verdict. This is the same failure contract the rest of the
// recipe runs on — when the machine cannot be sure, a human decides.

export interface ParsedRow {
  rowId: number;
  tab: string;
  questionId: string;
  question: string;
}

export interface DuplicateLink {
  rowId: number;
  duplicateOfRowId: number;
  similarity: number;
  /** Only exact matches are ever automatic. See the note at the top of this file. */
  kind: 'auto';
}

/**
 * A pair the reviewer may want to merge. Ordering only — explicitly NOT a claim
 * that these are duplicates. Rendered as "does this look like a repeat?", never
 * pre-checked.
 */
export interface MergeCandidate {
  rowId: number;
  candidateRowId: number;
  similarity: number;
}

export interface DedupResult {
  unique: ParsedRow[];
  links: DuplicateLink[];
  mergeCandidates: MergeCandidate[];
}

/** Floor for showing a pair in the reviewer's manual-merge list. */
export const CANDIDATE_FLOOR = 0.25;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'confirm',
  'describe',
  'do',
  'does',
  'for',
  'from',
  'have',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'please',
  'provide',
  'the',
  'to',
  'we',
  'what',
  'where',
  'which',
  'you',
  'your',
]);

/**
 * Crude suffix folding so "encryption"/"encrypted"/"encrypt" collapse to one
 * token. Deliberately not a real stemmer — a dependency-free approximation whose
 * failure mode is under-matching (safe: surfaces fewer duplicates) rather than
 * over-matching (unsafe: merges distinct questions).
 */
function fold(token: string): string {
  return token
    .replace(/(ization|isation|ation|ions|ion|ing|ed|es|s)$/u, '')
    .replace(/(ie)$/u, 'y');
}

export function normalizeTokens(question: string): Set<string> {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gu, ' ')
    // "at-rest" -> "at rest" so hyphenation never changes the token set
    .replace(/-/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .map(fold)
    .filter((token) => token.length > 1);
  return new Set(tokens);
}

export function similarity(a: string, b: string): number {
  const left = normalizeTokens(a);
  const right = normalizeTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Dedups across the whole questionnaire, not per tab — the same question
 * reappearing on a later tab is the single most common real-world case.
 */
export function dedupe(rows: ParsedRow[]): DedupResult {
  const unique: ParsedRow[] = [];
  const links: DuplicateLink[] = [];
  const mergeCandidates: MergeCandidate[] = [];

  for (const row of rows) {
    const exact = unique.find(
      (candidate) => similarity(row.question, candidate.question) === 1,
    );
    if (exact) {
      links.push({
        rowId: row.rowId,
        duplicateOfRowId: exact.rowId,
        similarity: 1,
        kind: 'auto',
      });
      continue;
    }

    for (const candidate of unique) {
      const score = similarity(row.question, candidate.question);
      if (score >= CANDIDATE_FLOOR) {
        mergeCandidates.push({
          rowId: row.rowId,
          candidateRowId: candidate.rowId,
          similarity: score,
        });
      }
    }
    unique.push(row);
  }

  mergeCandidates.sort((a, b) => b.similarity - a.similarity);
  return { unique, links, mergeCandidates };
}

/** Minimal RFC 4180 CSV reader: quoted fields, escaped quotes, embedded commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== '')) rows.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  record.push(field);
  if (record.some((value) => value.trim() !== '')) rows.push(record);

  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((values) =>
    Object.fromEntries(
      header.map((key, index) => [key.trim(), (values[index] ?? '').trim()]),
    ),
  );
}

export interface ColumnMapping {
  tab: string;
  questionId: string;
  question: string;
}

/** Step 1 of the flow: the user confirms which column holds the questions. */
export function extractRows(
  records: Record<string, string>[],
  mapping: ColumnMapping,
): ParsedRow[] {
  return records
    .map((record, index) => ({
      rowId: Number(record.row_id ?? index + 1),
      tab: record[mapping.tab] ?? 'Sheet1',
      questionId: record[mapping.questionId] ?? `Q-${index + 1}`,
      question: record[mapping.question] ?? '',
    }))
    .filter((row) => row.question.length > 0);
}
