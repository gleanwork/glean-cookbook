# Onboarding Hub — Web SDK path

Gamified onboarding checklist for Alex Kim plus Glean chat via `renderChat`.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. The Web SDK uses your existing Glean SSO session — no API token needed.

## Verify

1. Confirm the checklist shows 5 completed and 4 pending steps from the seeded corpus.
2. Click **Ask about this** on "Benefits enrollment" — chat opens with a contextual question.
3. Ask **What should Alex do on day one?** — cited answer references pending checklist items.
4. Mark all steps complete — done-state summary appears.

## Path note

This is Path A. For Path B (Platform Chat `POST /api/chat`), see [`../platform-chat/`](../platform-chat/).
