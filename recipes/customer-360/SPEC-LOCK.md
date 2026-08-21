# Customer 360 — spec lock

Build an account page from the reader's own indexed content. The reader supplies
`GLEAN_ACCOUNT_NAME`; every other account fact comes from retrieval or remains blank.

## Paths

- **Search + Chat:** Platform Search powers account, renewal, and security tiles. Platform Chat
  (`POST /api/chat`) produces cited summaries and follow-ups.
- **Agents:** Platform Search powers the same tiles; a configured Account Brief agent produces
  synthesis through `GLEAN_AGENT_ID`.

## Contracts

- Environment: `GLEAN_SERVER_URL`, `GLEAN_API_TOKEN`, `GLEAN_ACCOUNT_NAME`; Agents also requires
  `GLEAN_AGENT_ID`.
- Platform calls use `X_GLEAN_INCLUDE_EXPERIMENTAL=true`.
- Platform Chat verification sets `stream: false` and `store: false`, reads answer text from
  `ASSISTANT` `OUTPUT_TEXT` content, and reads citations from `annotations[].sources[]`.
- Tokens remain server-side. There is no act-as or impersonation.
- The overview shows the supplied account name and deterministic Search result counts; it never
  invents CRM fields from loosely matching documents.
- Empty retrieval renders an explicit empty state; empty Chat output is a failure.
- Both paths serve the canonical shared frontend and answer browser requests at `/api/ask`.

## Verification

Run the three `demoQueries` against the chosen account. Answers must be cited, overview counts must
come directly from Search results, and the Agent path must fail clearly when its agent is unavailable.
