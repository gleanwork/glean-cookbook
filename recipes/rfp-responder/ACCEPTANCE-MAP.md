# Acceptance map

Every requirement in the ticket, where it is implemented, and how it is proven.
`npm run verify:fixture` runs all of it with no credentials.

| #   | Ticket requirement                                                                    | Implementation                                                                        | Proof                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Upload questionnaire; enumerate tabs; confirm question + answer column                | `lib/questionnaire.ts` `parseCsv` / `extractRows`; `POST /api/parse`                  | `all 20 rows parsed`, `4 tabs enumerated`                                                                                                                                          |
| 2   | Extract and **deduplicate**; confirm before any API call                              | `dedupe`; UI gates the run behind "Confirm and draft"                                 | `only exact duplicates auto-merged (1)`, `at-rest and in-transit encryption were NOT merged`, `duplicate … surfaced` ×3                                                            |
| 3   | Run each question through Chat, batched, with progress                                | `POST /api/run`, SSE; `lib/chat.ts`                                                   | `progress events streamed`, `run completed`, `every row accounted for`                                                                                                             |
| 3b  | Custom instructions constrain to approved sources + paste-ready tone                  | `buildInstructions` in `lib/chat.ts`; `lib/approved-sources.ts`                       | `all 20 rows classified as the corpus supports`                                                                                                                                    |
| 4   | Review grid: answer, citations, **confidence flag**                                   | `lib/grounding.ts`; review table in `public/index.html`                               | `demo shows all three states`, `every answered row carries at least one citation`                                                                                                  |
| 5   | Accept / edit inline / **regenerate with steering**                                   | `POST /api/accept`, `POST /api/regenerate`                                            | `accepted row is marked accepted`                                                                                                                                                  |
| 5b  | Duplicate questions inherit the accepted answer                                       | accept handler re-propagates to exact matches                                         | `identical question inherited the accepted answer`                                                                                                                                 |
| 6   | **Export** preserving structure, behind confirm + approval log                        | `POST /api/export` (409 until `confirmed`)                                            | `export without confirmation is blocked`, `export preserves all 20 rows in order`, `unaccepted rows export blank rather than shipping a draft`                                     |
| 7   | **Answer library** pre-fills repeat questions                                         | `lib/answer-library.ts`, consulted in `handleParse`                                   | exercised by the accept path; `remember` + `lookup`                                                                                                                                |
| 7b  | Unanswerable rows flagged **"needs SME"** with an assignment field — never fabricated | `classify` returns `needsSme`; `POST /api/assign-sme`; accept refuses ungrounded rows | `no ungrounded row carries a draft answer`, `every ungrounded row routes to an SME`, `accepting an ungrounded row is rejected`, `an attachment request is never answered in prose` |

## Load-bearing, per the ticket

> "Every answer must carry citations; include the reviewer-approval step, the
> confidence flag, and the answer-library reuse loop — these are load-bearing parts
> of the pitch, not nice-to-haves."

| Requirement               | Enforced by                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Citations on every answer | `classify` returns `none` when citations are absent, and `none` never renders an answer. Asserted: `every answered row carries at least one citation`.                     |
| Reviewer approval step    | Nothing is `accepted` without an explicit call. Export reports how many rows are unaccepted and requires a second confirm. Every action is attributed in the approval log. |
| Confidence flag           | Two independent axes (topicality, approval-for-external-use) rather than a single relevance score. Asserted against the corpus oracle for all 20 rows.                     |
| Answer-library reuse      | Accepted pairs are stored and pre-fill matching questions on the next parse.                                                                                               |

## Scope boundaries

| Boundary      | Current contract                                                   |
| ------------- | ------------------------------------------------------------------ |
| Identity      | Single-user app that runs with the caller's own credential.        |
| Input         | CSV, with a bundled 20-row questionnaire fixture.                  |
| Output        | Export only; no source-system write-back.                          |
| Deduplication | Exact matches merge automatically; near-duplicates require review. |
| File formats  | xlsx and docx are out of scope.                                    |
