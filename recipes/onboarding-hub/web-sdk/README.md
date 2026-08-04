# Onboarding Hub — Web SDK path

Checklist + progress + Glean chat via `renderChat`. Steps come from
`public/steps.json` (your content) or a labeled fixture sample — not a hardcoded
named new hire.

## Run

```bash
npm install
# Optional: cp public/steps.example.json public/steps.json  # then edit
npm run dev
```

Open the printed local URL. The Web SDK uses your existing Glean SSO session — no API token needed.

- **Live steps:** serve `public/steps.json` (copy from `steps.example.json`).
- **Fixture sample:** open with `?fixture=1` to load `steps.fixture.json`.
- **Empty:** without `steps.json` and without `?fixture=1`, the checklist is empty with instructions — it will not invent a persona.

## Verify

1. Confirm the real Glean logomark and Glean Blue accent — no Acme / named-hire chrome.
2. With fixture or `steps.json`, confirm pending/done lists and progress render.
3. Click **Ask about this** on a pending step — chat opens with that prompt.
4. Ask **What should I do on my first day?** for a cited answer from your instance.
5. Mark all steps complete — done-state summary appears.

## Path note

This is Path A. For Path B (Platform Chat `POST /api/chat`), see [`../platform-chat/`](../platform-chat/).
