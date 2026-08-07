# Acceptance map (PACT-449)

Maps each showpiece state to Path A (Web SDK) and Path B (Client Chat). Checklist
steps come from the reader's config — never a hardcoded named hire or Acme corpus.
Chat answers use the reader's own indexed onboarding content.

| #   | Showpiece state                       | Path A (Web SDK)                                                | Path B (Client Chat)                                                 | Demo query / note                         |
| --- | ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Checklist (done vs pending)           | Load `steps.json`; localStorage toggles completion              | `GET /api/checklist` from `GLEAN_ONBOARDING_STEPS_*`; client toggles | Live: your steps                          |
| 2   | Progress indicator + milestone badges | Progress % = completed/total; badges earn per group             | Same client-side logic                                               | Empty checklist → 0%                      |
| 3   | Per-step **Ask about this**           | `renderChat` re-seeded with `initialMessage` per step           | Client Chat with a step-specific USER message                        | Step `askPrompt` from config              |
| 4   | Free-form cited chat                  | `renderChat` handles UI + citations (SSO cookie)                | Parse CONTENT messages and fragment citations                        | Live verify: first-day, VPN, PTO          |
| 5   | No answer found → escalate            | Glean chat surfaces low-confidence; app can show escalate strip | Empty/short/**uncited** → `escalate: true` + UI affordance           | Live verify: off-corpus query             |
| 6   | Done state                            | All steps marked complete → summary panel replaces checklist    | Same client UX                                                       | Mark all complete or finish pending items |
| 7   | Empty live chat (Path B)              | N/A (Web SDK owns streaming UI)                                 | Empty answer retries once, then surfaces a transport error           | Not treated as missing evidence           |

## Demo queries (registry)

| Query                             | Expected behavior                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| What should I do on my first day? | Cited answer from your own onboarding documents; checklist reflects configured steps, not a persona |
| How do I set up VPN?              | Cited answer from your own IT documentation                                                         |
| What's our PTO policy?            | Cited answer respecting the asker's permissions                                                     |
| Ask about a step docs don't cover | Hub says it has nothing and offers escalation rather than inventing a step                          |
