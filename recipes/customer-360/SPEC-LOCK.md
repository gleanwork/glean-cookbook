# Milestone 0 — Spec lock (PACT-450)

**Status:** Locked for implementation.  
**FYI:** Platform-only surfaces (Search + Chat + Agents). No Client `/rest/api/v1/*`.

## Locked decisions

| Field                           | Value                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                            | `customer-360`                                                                                             |
| `status` / `category` / `level` | `showcase` / `workflow` / Intermediate                                                                     |
| Dual impl                       | Path A Platform Search + Chat · Path B Platform Agents                                                     |
| `surfaces`                      | `["platform-api"]`                                                                                         |
| `requiredScopes`                | `["SEARCH", "CHAT", "AGENTS"]`                                                                             |
| `authMethod`                    | `["client-api-oauth-or-token"]`                                                                            |
| `combines`                      | permissions-aware-rag (Platform Search); onboarding-hub Platform Chat pattern; Platform Agents `createRun` |
| Demo queries                    | Globex renewal status; Customer summary; Renewal risks                                                     |
| Brand                           | Acme teal `#0E8C84`, Sam Reyes / Globex                                                                    |
| Code layout                     | `recipes/customer-360/{platform-search-chat,platform-agents}/`                                             |
| `goDependency` / `featured`     | both `false`                                                                                               |
| Pinned SDK                      | `@gleanwork/api-client@0.18.0`                                                                             |

## Contracts (verified against OpenAPI + SDK 0.18.0)

| Surface | Call                                                                        | Wait semantics                                                 | Experimental                                        |
| ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Search  | `glean.search.query` → `POST /api/search`                                   | Sync `PlatformSearchResponse` (`results[].title/url/snippets`) | `X_GLEAN_INCLUDE_EXPERIMENTAL=true` (env; SDK hook) |
| Chat    | raw `fetch` → `POST /api/chat`                                              | Sync JSON when `stream: false`                                 | Header + `platform.apiMigratedEndpointsEnabled`     |
| Agents  | `glean.agents.createRun(req, agentId)` → `POST /api/agents/{agent_id}/runs` | Sync wait body when `stream: false` (**no polling**)           | Same experimental opt-in                            |

### Chat parse path

- Request: `{ input, stream: false, store: true }`
- Response: `output[].content[]` where `type === 'output_text'` → `text` + `annotations[].sources[]` (`title`, `url`)
- **Not** Client API `glean.client.chat.create` / fragment parsing

### Agents parse path

- Request: `{ messages: [{ role: "USER", content: [{ text, type: "text" }] }], stream: false }` (or `input` for form-triggered agents)
- Response: `PlatformAgentRunWaitResponse` — `messages[]` with `role` + `content[].text`; `request_id`
- **Not** `glean.client.agents.run`

### Security

Tokens and Glean calls stay server-side. Browser only hits local recipe routes.

## Corpus backing

Existing Globex docs only (no invented Gong/Zendesk sources):

- `sales-globex-account-notes` — account overview tile / KPI grounding
- `sales-globex-renewal-status` — renewal tile + renewal demo queries
- `sales-globex-security-questionnaire` — security tile

Persona: `sam.reyes@acme.example.com` (Account Executive).

## Non-goals (Extensions only)

- Portfolio / multi-account dashboard
- Weekly digest headless job
- Slack / CRM write-back
- Prospecting flows

## Path B prereqs

- Account Brief agent created in Agent Builder (template-driven QBR sections)
- `GLEAN_AGENT_ID` server-only env
- Fixture-first verify by default; optional live script checks agent existence/schema before `createRun`
