# Onboarding Hub

A first-week checklist grounded in your indexed onboarding content, with local progress tracking and
contextual Glean chat. Choose one implementation:

- [`web-sdk/`](web-sdk/) embeds Glean chat and uses the viewer's existing browser SSO session.
- [`platform-chat/`](platform-chat/) calls Platform Chat from a server with your token and renders a
  custom answer, citations, and escalation state.

Start with the README inside the implementation you choose. The Web SDK path must be opened by the
user in their normal signed-in browser; an agent-controlled or incognito browser does not share their
Glean session.
