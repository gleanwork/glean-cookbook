# Acceptance map

Maps each showpiece state on the account page to Path A (`platform-search-chat`)
and Path B (`platform-agents`). The account name and every figure come from the
reader's own instance via `GLEAN_ACCOUNT_NAME` + retrieval — never from a fixed
demo corpus.

| #   | Showpiece state              | Path A (Search + Chat)                                                         | Path B (Agents)                                             | Demo query / note                                     |
| --- | ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Evidence coverage            | Deterministic result counts from the three Search queries                      | Same                                                        | Never inferred by synthesis                           |
| 2   | Three source sections        | Parallel `glean.search.query` for notes / renewal / security framed by account | Same Search results; synthesis via agent                    | Queries inject `GLEAN_ACCOUNT_NAME`                   |
| 3   | Initial account summary      | First assistant message comes from an account-framed Client Chat call          | First assistant message comes from `glean.agents.createRun` | "Give me a customer summary"                          |
| 4   | Suggested questions          | Chips append Chat answers to the same thread                                   | Chips append agent answers to the same thread               | Customer summary; renewal risks; renewal status       |
| 5   | Drill-in follow-up           | Free-form questions append without replacing earlier turns                     | Same                                                        | "What's the status of our renewal with that account?" |
| 6   | Missing evidence             | Empty section → "No matching evidence found"                                   | Same; agent missing/unauthorized → explicit error card      | Off-corpus query or empty search                      |
| 7   | Empty / unfinished synthesis | HTTP 200 with no answer text → error, not a blank success                      | Empty GLEAN_AI text → error                                 | Transport failure, not missing evidence               |
| 8   | Negative facts vs missing    | A cited "low risk" is a **fact**; no CRM field is inferred                     | Same                                                        | Must not invent risk the sources do not support       |

## Demo queries (registry)

| Query                                               | Expected behavior                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| What's the status of our renewal with that account? | Non-empty cited answer about the chosen account; substitute the name when asking         |
| Give me a customer summary                          | Synthesizes across more than one source with a citation per claim                        |
| What are the renewal risks?                         | Names risks grounded in citations, or says it has none — must not infer unsupported risk |
