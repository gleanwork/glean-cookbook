# Milestone 1b — Acceptance map (PACT-449)

Maps each showpiece state from the approved prototype to Path A (Web SDK) and Path B (Platform Chat) acceptance criteria and proving demo query / corpus doc.

| #   | Showpiece state                       | Prototype reference                   | Path A (Web SDK)                                                        | Path B (Platform Chat)                                                         | Demo query / corpus                                                                       |
| --- | ------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | Alex Kim checklist (done vs pending)  | Checklist card, 5 done / 4 pending    | Static checklist seeded from corpus; localStorage toggles completion    | Same UI; server does not own checklist state                                   | `hr-onboarding-checklist-alex-kim`                                                        |
| 2   | Progress indicator + milestone badges | Progress ring + IT/HR/Team/Eng chips  | Progress % = completed/total; badges earn per group                     | Same client-side logic                                                         | Checklist groups in `src/checklist.ts`                                                    |
| 3   | Per-step **Ask about this**           | Button seeds contextual chat question | `renderChat` re-seeded with `initialMessage` per step                   | `POST /api/chat` with step-specific `input` string                             | Step prompts in checklist data                                                            |
| 4   | Free-form cited chat                  | Chat input + citation cards           | `renderChat` handles UI + citations (SSO cookie)                        | Parse `output[0].content[0].text` + `annotations[].sources[]`                  | `What should Alex do on day one?` → checklist; `What's our PTO policy?` → `hr-pto-policy` |
| 5   | No answer found → escalate            | Amber card, #hr-help / #it-help links | Glean chat surfaces low-confidence; app shows escalate strip below chat | Empty/short answer → render escalate affordance (nonfunctional Slack links OK) | Off-corpus query e.g. `How do I expense a home-office chair?`                             |
| 6   | Done state                            | Completion summary + next resources   | All steps marked complete → summary panel replaces checklist            | Same client UX                                                                 | Mark all complete or finish pending items                                                 |

## Demo queries (registry)

| Query                                            | Expected behavior                                                 | Corpus                             |
| ------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------- |
| What should Alex do on day one?                  | Lists pending onboarding steps with citations to Alex's checklist | `hr-onboarding-checklist-alex-kim` |
| What onboarding steps do I still need to finish? | Same pending items, permission-aware to Alex                      | `hr-onboarding-checklist-alex-kim` |
| How do I set up VPN?                             | Cited answer from VPN guide                                       | `support-vpn-setup-guide`          |
| What's our PTO policy?                           | Cited PTO policy answer                                           | `hr-pto-policy`                    |

**Signed:** Chris Freeman, 2026-07-30
