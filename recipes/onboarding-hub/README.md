# Onboarding Hub

A first-week checklist grounded in your indexed onboarding content, with local progress tracking and
contextual Glean chat. Choose one implementation:

- [`web-sdk/`](web-sdk/) embeds Glean chat and uses your existing browser SSO session.
- [`platform-chat/`](platform-chat/) calls Client Chat from a server with your token and renders a
  custom answer, citations, and escalation state.

Start with the README inside the implementation you choose. For the Web SDK path, open the page in
the same browser where you are already signed in to Glean. A private or incognito window does not
share that session.
