# Milestone 0 — Spec lock (PACT-450)

**Status:** Locked for implementation.  
**FYI:** Platform-only surfaces (Search + Chat + Agents). No Client `/rest/api/v1/*`.

The page is built around an account the reader picks (`GLEAN_ACCOUNT_NAME`).
Every figure on the KPI header comes from retrieval or stays blank — nothing
hardcodes ARR, seats, renewal date, owner, or risk.

## Locked decisions

| Field                           | Value                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                            | `customer-360`                                                                                       |
| `status` / `category` / `level` | `showcase` / `workflow` / Intermediate                                                               |
| Dual impl                       | Path A Platform Search + Chat · Path B Platform Agents                                               |
| `surfaces`                      | `["platform-api"]`                                                                                   |
| `requiredScopes`                | `["SEARCH", "CHAT", "AGENTS"]`                                                                       |
| `authMethod`                    | `["client-api-oauth-or-token"]`                                                                      |
| `combines`                      | permissions-aware-retrieval (Platform Search); onboarding-hub Platform Chat pattern; Platform Agents |
| Demo queries                    | Renewal status; customer summary; renewal risks (account implicit; substitute the chosen name)       |
| Auth                            | Caller's own credential; **no act-as / impersonation**                                               |
| Brand                           | Glean Blue `#343ced`, real logomark; account supplied via `GLEAN_ACCOUNT_NAME`                       |
| Code layout                     | `recipes/customer-360/{platform-search-chat,platform-agents}/`                                       |
| Env                             | `GLEAN_SERVER_URL`, `GLEAN_API_TOKEN`, `GLEAN_ACCOUNT_NAME` (+ `GLEAN_AGENT_ID` for Path B)          |
| `goDependency` / `featured`     | both `false`                                                                                         |
| Pinned SDK                      | `@gleanwork/api-client@0.18.0`                                                                       |

## Contracts (verified against OpenAPI + SDK 0.18.0)

| Surface | Call                                                                        | Wait semantics                                                 | Experimental                                        |
| ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Search  | `glean.search.query` → `POST /api/search`                                   | Sync `PlatformSearchResponse` (`results[].title/url/snippets`) | `X_GLEAN_INCLUDE_EXPERIMENTAL=true` (env; SDK hook) |
| Chat    | raw `fetch` → `POST /api/chat`                                              | Sync JSON when `stream: false`                                 | Header + a backend opt-in                           |
| Agents  | `glean.agents.createRun(req, agentId)` → `POST /api/agents/{agent_id}/runs` | Sync wait body when `stream: false` (**no polling**)           | Same experimental opt-in                            |

### Chat parse path

- Request: `{ input, stream: false, store: true }`
- Response: `output[].content[]` where `type === 'output_text'` → `text` + `annotations[].sources[]` (`title`, `url`)
- Empty `output_text` after HTTP 200 is treated as failure (unfinished run), not a blank success
- Platform Chat is the target contract, not Client API `chat.create` — but see **Transport reality** below: it is unavailable, so the code currently uses `/rest/api/v1/chat`
- Backend URL from `GLEAN_SERVER_URL` (not derived from an instance name)

### Agents parse path

- Request: `{ messages: [{ role: "USER", content: [{ text, type: "text" }] }], stream: false }` (or `input` for form-triggered agents)
- Response: `PlatformAgentRunWaitResponse` — `messages[]` with `role` + `content[].text`; `request_id`
- **Not** `glean.client.agents.run`

### Security

Tokens and Glean calls stay server-side. Browser only hits local recipe routes.
No impersonation headers (`X-Glean-ActAs` / `X-Glean-Act-As`).

## Content backing

Live: whatever the reader's instance already knows about `GLEAN_ACCOUNT_NAME`.
Verify: `npm run verify` against live Platform APIs (credentials required).

## Non-goals (Extensions only)

- Portfolio / multi-account dashboard
- Weekly digest headless job
- Slack / CRM write-back
- Prospecting flows

## Path B prereqs

- Account Brief agent created in Agent Builder (template-driven QBR sections)
- `GLEAN_AGENT_ID` server-only env
- Live verify requires the agent; missing/unauthorized → explicit failure UX

## Transport (2026-08-06)

`POST /api/chat` is not available on the instances we test against — it returns 404 — so the
code calls `POST /rest/api/v1/chat` instead. The response parsing differs; the comments in the
recipe explain how. Platform Chat remains the intended contract: revert and delete this section
once the endpoint is available.
