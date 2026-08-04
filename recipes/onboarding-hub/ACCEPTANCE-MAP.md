# Acceptance map (PACT-449)

Maps each showpiece state to Path A (Web SDK) and Path B (Platform Chat). Checklist
steps come from the reader's config (or a labeled fixture sample) — never a
hardcoded named hire or Acme corpus. Chat answers use the reader's own indexed
onboarding content.

| #   | Showpiece state                       | Path A (Web SDK)                                                         | Path B (Platform Chat)                                                          | Demo query / note                               |
| --- | ------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Checklist (done vs pending)           | Load `steps.json` / `?fixture=1` sample; localStorage toggles completion | `GET /api/checklist` from fixture or `GLEAN_ONBOARDING_STEPS_*`; client toggles | Live: your steps; fixture: `steps.fixture.json` |
| 2   | Progress indicator + milestone badges | Progress % = completed/total; badges earn per group                      | Same client-side logic                                                          | Empty checklist → 0%                            |
| 3   | Per-step **Ask about this**           | `renderChat` re-seeded with `initialMessage` per step                    | `POST /api/chat` with step-specific `input` string                              | Step `askPrompt` from config                    |
| 4   | Free-form cited chat                  | `renderChat` handles UI + citations (SSO cookie)                         | Parse `output[0].content[0].text` + `annotations[].sources[]`                   | Fixture+live verify: first-day, VPN, PTO        |
| 5   | No answer found → escalate            | Glean chat surfaces low-confidence; app can show escalate strip          | Empty/short answer → `escalate: true` + UI affordance                           | Fixture+live verify: off-corpus query           |
| 6   | Done state                            | All steps marked complete → summary panel replaces checklist             | Same client UX                                                                  | Mark all complete or finish pending items       |
| 7   | Empty / unfinished live chat (Path B) | N/A (Web SDK owns streaming UI)                                          | HTTP 200 with no answer text → error (retry), not a blank success               | Matches company-answers / customer-360 lesson   |

## Demo queries (registry)

| Query                             | Expected behavior                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| What should I do on my first day? | Cited answer from your own onboarding documents; checklist reflects configured or fixture steps, not a persona |
| How do I set up VPN?              | Cited answer from your own IT documentation                                                                    |
| What's our PTO policy?            | Cited answer respecting the asker's permissions                                                                |
| Ask about a step docs don't cover | Hub says it has nothing and offers escalation rather than inventing a step                                     |
