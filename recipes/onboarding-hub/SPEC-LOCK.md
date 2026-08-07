# Spec lock (PACT-449)

**Status:** Locked for de-Acme scaffolds (reader-owned content).  
**FYI:** Path B is Platform Chat (`POST /api/chat`), experimental opt-in, fetch-until-SDK.

## Locked decisions

| Field                           | Value                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                            | `onboarding-hub`                                                                                                   |
| `status` / `category` / `level` | `showcase` / `portal` / Intermediate                                                                               |
| Dual impl                       | Path A Web SDK · Path B Platform Chat                                                                              |
| `surfaces`                      | `["web-sdk", "platform-api"]`                                                                                      |
| `requiredScopes`                | `["CHAT"]` (chat-only; no search surface)                                                                          |
| `authMethod`                    | `["web-sdk-cookie", "client-api-oauth-or-token"]`                                                                  |
| `combines`                      | (1) Embed search & chat / Web SDK / search / typescript; (2) Build a chatbot / Platform Chat / portal / typescript |
| Demo queries                    | First day, VPN, PTO, off-corpus escalation                                                                         |
| Brand                           | Glean Blue `#343ced` + real Glean logomark; no named-hire / Acme Corp chrome                                       |
| Auth                            | Caller's own credential; **no act-as / impersonation**                                                             |
| Checklist source                | Reader config (`steps.json` / `GLEAN_ONBOARDING_STEPS_*`); never invent a hire list                                |
| Code layout                     | `recipes/onboarding-hub/{web-sdk,platform-chat}/`                                                                  |
| `goDependency` / `featured`     | both `false`                                                                                                       |

## Path B contract

- `POST /api/chat` with `{ "input": "...", "stream": false, "store": true }`
- Response: `output[0].content[0].text` + `annotations[].sources[]`
- Experimental: `X-GLEAN-INCLUDE-EXPERIMENTAL=true`
- Platform scope: `CHAT` (see `llmContext` / registry)
- Auth: `GLEAN_SERVER_URL` + caller's `GLEAN_API_TOKEN` — no `X-Glean-ActAs`
- Checklist: `GET /api/checklist` — `GLEAN_ONBOARDING_STEPS_FILE` / `GLEAN_ONBOARDING_STEPS_JSON`
- Platform Chat is the target contract, not Client API `chat.create` — but see **Transport reality** below: it is unavailable, so the code currently uses `/rest/api/v1/chat`

## Content backing

- Live: the reader's own indexed onboarding / HR / IT docs
- Verify: `npm run verify` against live `/api/chat` (credentials required)

## Non-blocking

- Auto-deriving checklist steps from Search/Chat (explicitly out of scope)
- Handler/SDK GA (cookbook teaches OpenAPI contract)
- `featured` band placement

## Transport (2026-08-06)

`POST /api/chat` is not available on the instances we test against — it returns 404 — so the
code calls `POST /rest/api/v1/chat` instead. The response parsing differs; the comments in the
recipe explain how. Platform Chat remains the intended contract: revert and delete this section
once the endpoint is available.
