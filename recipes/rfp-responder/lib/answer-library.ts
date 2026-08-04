// Answer library — accepted Q&A pairs, reused to pre-fill the next questionnaire.
//
// In-memory + a JSON file so the recipe is runnable with no database. A real
// deployment would put this behind a store with its own ACLs, because an answer
// library is a cache of retrieved content and therefore a way to leak across the
// permission boundary the rest of the app is careful to respect. Called out in the
// README rather than silently modelled as a solved problem.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { similarity } from './questionnaire.ts';
import type { Citation } from './grounding.ts';

export interface LibraryEntry {
  question: string;
  answer: string;
  citations: Citation[];
  acceptedAt: string;
  acceptedBy: string;
}

const STORE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.answer-library.json',
);

export function load(): LibraryEntry[] {
  if (!fs.existsSync(STORE)) return [];
  return JSON.parse(fs.readFileSync(STORE, 'utf8')) as LibraryEntry[];
}

export function save(entries: LibraryEntry[]): void {
  fs.writeFileSync(STORE, `${JSON.stringify(entries, null, 2)}\n`);
}

export function remember(entry: LibraryEntry): void {
  const entries = load().filter(
    (existing) => similarity(existing.question, entry.question) !== 1,
  );
  entries.push(entry);
  save(entries);
}

/**
 * Exact-match lookup only, for the same reason dedup is exact-match only: a
 * near-miss here silently reuses last quarter's answer for a subtly different
 * question. Suggestions are surfaced separately for the reviewer to pull in.
 */
export function lookup(question: string): LibraryEntry | undefined {
  return load().find((entry) => similarity(entry.question, question) === 1);
}

export function suggestions(question: string, floor = 0.3): LibraryEntry[] {
  return load()
    .map((entry) => ({ entry, score: similarity(entry.question, question) }))
    .filter(({ score }) => score >= floor && score < 1)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}
