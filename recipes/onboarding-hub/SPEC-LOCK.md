# Milestone 0 — Spec lock (PACT-449)

**Status:** Draft — awaiting Chris sign-off (M0 gate).  
**FYI (once signed):** Steve Kam — Path B is Platform Chat (`POST /api/chat`), experimental opt-in, fetch-until-SDK.

## Locked decisions

| Field                           | Value                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                            | `onboarding-hub`                                                                                                   |
| `status` / `category` / `level` | `showcase` / `portal` / Intermediate                                                                               |
| Dual impl                       | Path A Web SDK · Path B Platform Chat                                                                              |
| `surfaces`                      | `["web-sdk", "platform-api"]`                                                                                      |
| `requiredScopes`                | `["CHAT", "SEARCH"]`                                                                                               |
| `authMethod`                    | `["web-sdk-cookie", "client-api-oauth-or-token"]`                                                                  |
| `combines`                      | (1) Embed search & chat / Web SDK / search / typescript; (2) Build a chatbot / Platform Chat / portal / typescript |
| Demo queries                    | Day-one, onboarding steps remaining, VPN, PTO                                                                      |
| Brand                           | Acme teal `#0E8C84`, Alex Kim persona                                                                              |
| Code layout                     | `recipes/onboarding-hub/{web-sdk,platform-chat}/`                                                                  |
| `goDependency` / `featured`     | both `false`                                                                                                       |

## Path B contract

- `POST /api/chat` with `{ "input": "...", "stream": false, "store": true }`
- Response: `output[0].content[0].text` + `annotations[].sources[]`
- Experimental: `X-GLEAN_INCLUDE_EXPERIMENTAL=true`
- Platform scope: `CHAT_WRITE` (documented in `llmContext`)
- **Not** Client API `glean.client.chat.create`

## Corpus backing

- `hr-onboarding-checklist-alex-kim` — checklist done/pending
- `support-vpn-setup-guide` — VPN demo query
- `hr-pto-policy` — PTO demo query
- `support-sso-password-reset`, `support-it-helpdesk-faq` — IT escalation context
- `eng-payments-architecture` — architecture walkthrough step

## Non-blocking

- Master recipe specs file (proceed from PACT-449 + OpenAPI + brand)
- Handler/SDK GA (cookbook teaches OpenAPI contract; fixtures OK)
- Frank He polish (optional after prototype)
- `featured` band placement (PACT-460)
