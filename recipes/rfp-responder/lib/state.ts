// In-process run state + approval log. One questionnaire at a time, which is all a
// single-user recipe needs. A deployment would persist this per user.

import type { Citation, Confidence } from './grounding.ts';
import type {
  DuplicateLink,
  MergeCandidate,
  ParsedRow,
} from './questionnaire.ts';

export type RowStatus = 'pending' | 'drafted' | 'accepted' | 'needs-sme';

export interface RowState extends ParsedRow {
  status: RowStatus;
  answer: string;
  citations: Citation[];
  confidence: Confidence | null;
  reason: string;
  /** Row id this row inherited its accepted answer from, if any. */
  inheritedFrom?: number;
  smeAssignee?: string;
  editedByReviewer: boolean;
  fromLibrary: boolean;
}

export interface ApprovalEntry {
  at: string;
  actor: string;
  action: 'accept' | 'edit-and-accept' | 'assign-sme' | 'export';
  rowId?: number;
  questionId?: string;
  detail?: string;
}

export interface RunState {
  rows: RowState[];
  duplicates: DuplicateLink[];
  mergeCandidates: MergeCandidate[];
  approvals: ApprovalEntry[];
  sourceName: string;
}

export const state: { run: RunState | null } = { run: null };

export function requireRun(): RunState {
  if (!state.run)
    throw new Error('No questionnaire loaded. POST /api/parse first.');
  return state.run;
}

export function findRow(run: RunState, rowId: number): RowState {
  const row = run.rows.find((candidate) => candidate.rowId === rowId);
  if (!row) throw new Error(`Unknown row: ${rowId}`);
  return row;
}

export function log(run: RunState, entry: Omit<ApprovalEntry, 'at'>): void {
  run.approvals.push({ at: new Date().toISOString(), ...entry });
}
