# Onboarding Hub — spec lock

Build a first-week checklist from reader-supplied steps and answer questions from the reader's
indexed onboarding content. Never invent a person, checklist item, link, or company process.

## Paths

- **Web SDK:** use `renderChat` with the reader's SSO session and an explicit backend. Preserve
  `chatId` when re-mounting with a step's `initialMessage`.
- **Client Chat:** call `POST /rest/api/v1/chat` from the server and render the answer and citations
  in the custom UI.

## Contracts

- Checklist input comes from `GLEAN_ONBOARDING_STEPS_JSON` or `GLEAN_ONBOARDING_STEPS_FILE`.
- Client Chat uses `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN`, sets `saveChat: false` for verification,
  reads `CONTENT` messages by `GLEAN_AI`, and reads citations from
  `fragments[].citation.sourceDocument`.
- Empty Chat output retries once and then surfaces a transport error.
- Completed thin or uncited answers show the escalation affordance.
- Completion state is local to the browser.

## Verification

Run every `demoQuery`. First-day, VPN, and PTO questions must produce cited answers when supported;
an unsupported question must escalate without fabrication.
