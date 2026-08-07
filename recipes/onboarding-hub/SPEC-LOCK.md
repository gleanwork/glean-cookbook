# Onboarding Hub contract

Build a first-week checklist from user-supplied steps and answer questions from the user's indexed
onboarding content. Never invent a person, company process, checklist item, or resource link.

## Web SDK

- Read a required `VITE_GLEAN_BACKEND` HTTPS origin and pass it explicitly to `renderChat`.
- Use the viewer's existing Glean SSO session. The user opens the printed local URL in their normal
  signed-in browser; agents do not open or automate it.
- Read checklist steps from `public/steps.json`. Missing and invalid configuration are distinct,
  actionable states.
- Seed a step question by re-mounting with `initialMessage`. Do not pass `chatId`: it suppresses
  the message, so each ask starts a fresh thread.
- Keep completion state in localStorage.

## Client Chat

- Read checklist steps from `GLEAN_ONBOARDING_STEPS_JSON` or `GLEAN_ONBOARDING_STEPS_FILE`.
- Call `POST /rest/api/v1/chat` from the server with `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN`.
- Set `saveChat: false` for verification, read `CONTENT` messages by `GLEAN_AI`, and read citations
  from `fragments[].citation.sourceDocument`.
- Retry empty output once, then return a transport error.
- Show an escalation affordance for completed thin, unsupported, or uncited answers.

## Verification

Both paths verify cited answers for supported first-day, VPN, and PTO questions. The Client Chat path
also verifies the application-owned escalation state for an unsupported question.
