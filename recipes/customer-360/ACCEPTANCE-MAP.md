# Acceptance map (PACT-450)

Maps each showpiece state on the account page to Path A (`platform-search-chat`)
and Path B (`platform-agents`). The account name and every figure come from the
reader's own instance via `GLEAN_ACCOUNT_NAME` + retrieval — never from a fixed
demo corpus.

| #   | Showpiece state                        | Path A (Search + Chat)                                                         | Path B (Agents)                                                                  | Demo query / note                                     |
| --- | -------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | KPI header (ARR, renewal, risk, owner) | Blank/`—` until a retrieved doc supports the field                             | Same                                                                             | Live: retrieval only                                  |
| 2   | Three source sections                  | Parallel `glean.search.query` for notes / renewal / security framed by account | Same Search tiles (Agents path still uses Search for tiles); synthesis via agent | Queries inject `GLEAN_ACCOUNT_NAME`                   |
| 3   | Journey summary                        | One Client Chat call with an account-framed prompt                             | `glean.agents.createRun` with account-framed USER message                        | "Give me a customer summary"                          |
| 4   | Saved prompts                          | Buttons fire Chat with account-framed prompts                                  | Buttons fire `createRun` with the same prompts                                   | Customer summary; renewal risks; renewal status       |
| 5   | Drill-in follow-up                     | Free-form Chat keeps account framing                                           | Free-form `createRun` with same framing                                          | "What's the status of our renewal with that account?" |
| 6   | Missing evidence                       | Empty tile → "no recent activity"                                              | Same empty-tile UX; agent missing/unauthorized → explicit error card             | Off-corpus query or empty search                      |
| 7   | Empty / unfinished synthesis           | HTTP 200 with no answer text → error, not a blank success                      | Empty GLEAN_AI text → error                                                      | Transport failure, not missing evidence               |
| 8   | Negative facts vs missing              | A cited "low risk" (or similar) is a **fact**; blank KPI is missing evidence   | Same                                                                             | Must not invent risk the sources do not support       |

## Demo queries (registry)

| Query                                               | Expected behavior                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| What's the status of our renewal with that account? | Non-empty cited answer about the chosen account; substitute the name when asking         |
| Give me a customer summary                          | Synthesizes across more than one source with a citation per claim                        |
| What are the renewal risks?                         | Names risks grounded in citations, or says it has none — must not infer unsupported risk |
