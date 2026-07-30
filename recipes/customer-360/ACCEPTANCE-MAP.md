# Acceptance map (PACT-450)

Maps each showpiece state on the Globex account page to Path A (`platform-search-chat`) and Path B (`platform-agents`).

| #   | Showpiece state                        | Path A (Search + Chat)                                               | Path B (Agents)                                                                                             | Demo query / corpus                                                     |
| --- | -------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | KPI header (ARR, renewal, risk, owner) | Seeded from Globex corpus facts; labeled demo metadata in UI         | Same seeded KPIs                                                                                            | `sales-globex-account-notes`, `sales-globex-renewal-status`             |
| 2   | Three source sections                  | Parallel `glean.search.query` for account notes / renewal / security | Same Search tiles (Agents path still uses Search for tiles) **or** tiles from fixtures; synthesis via agent | Three Globex docs                                                       |
| 3   | Journey summary                        | One `POST /api/chat` with account-framed prompt                      | `glean.agents.createRun` with account-framed USER message                                                   | Customer summary / journey                                              |
| 4   | Saved prompts                          | Buttons fire Chat with injected "Globex"                             | Buttons fire `createRun` with prompt template                                                               | "Customer summary for Globex"; "What are the renewal risks for Globex?" |
| 5   | Drill-in follow-up                     | Free-form Chat keeps Globex in prompt framing                        | Free-form `createRun` with same framing                                                                     | "What's the status of the Globex renewal?"                              |
| 6   | Missing evidence                       | Empty tile → "no recent activity"                                    | Same empty-tile UX; agent missing/unauthorized → explicit error card                                        | Off-corpus or empty search fixture                                      |
| 7   | Negative facts vs missing              | Low risk from renewal doc is a **fact**, not empty                   | Same                                                                                                        | `sales-globex-renewal-status` ("Risk level: low")                       |

## Demo queries (registry)

| Query                                    | Expected behavior                                                 | Corpus                        |
| ---------------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| What's the status of the Globex renewal? | Cites renewal date, on-track status, open items                   | `sales-globex-renewal-status` |
| Customer summary for Globex              | Synthesis citing account notes + renewal                          | notes + renewal               |
| What are the renewal risks for Globex?   | Cites open items (DPA, procurement); risk stated as low is a fact | `sales-globex-renewal-status` |
