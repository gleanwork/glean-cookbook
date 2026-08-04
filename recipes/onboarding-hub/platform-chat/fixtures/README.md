# Fixtures (contract-only)

These files drive `GLEAN_USE_FIXTURE=true` / `npm run verify:fixture`. They are
labeled samples for OpenAPI shape and escalation behavior — not a real hire's
checklist and not content from any reader's instance.

| File                  | Role                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `steps.json`          | Sample checklist for `/api/checklist`                                          |
| `chat-responses.json` | Query-keyed Platform Chat responses (cited day-one/VPN/PTO + empty off-corpus + unsafe-URL regression) |

Do not treat fixture titles or URLs as live corpus. Live mode uses
`GLEAN_SERVER_URL` + `GLEAN_API_TOKEN` and the reader's own onboarding docs.
