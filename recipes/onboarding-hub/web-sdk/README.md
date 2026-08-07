# Onboarding Hub — Web SDK path

Checklist + progress + Glean chat via `renderChat`. Steps come from
`public/steps.json` (your content) — not a hardcoded named new hire.

## Run

```bash
npm install
# Optional: cp public/steps.example.json public/steps.json          # then edit
# Optional: cp public/resources.example.json public/resources.json   # then edit
npm run dev
```

Open the printed local URL. The Web SDK uses your existing Glean SSO session — no API token needed.

- **Live steps:** serve `public/steps.json` (copy from `steps.example.json`).
- **Empty:** without `steps.json`, the checklist is empty with instructions — it will not invent a persona.
- **Done-state links:** serve `public/resources.json` (copy from `resources.example.json`). Without it
  the completion panel says how to configure it rather than showing placeholder links. Entries need a
  `title` and an `http(s)` or site-relative `url`; anything else is skipped.

### Recommended: set `backend`

`renderChat` takes a `backend` option, commented out in `src/main.ts`. Leaving it unset means the
widget asks the new hire for their email address to route to the right instance before they see
anything. Get your value with:

```bash
node <plugin>/scripts/resolve-backend.mjs <your work email>
```

## How the chat is wired

Two things worth knowing if you adapt this:

- **The opening message is built from your checklist**, not a fixed string — see `buildContextPrompt`
  in `src/checklist.ts`. It names the steps still outstanding so the conversation starts aware of the
  page beside it. This is prompt-level framing only: Glean still answers from your indexed documents,
  it does not scope the corpus. With no steps configured it falls back to a generic question rather
  than claiming steps that don't exist.
- **"Ask about this" continues the conversation** instead of restarting it. The SDK has no imperative
  "send message" call — `renderChat` returns a `ChatHandle` exposing only `on`/`off` — so injecting a
  message means remounting the widget. Remounting alone would discard the whole thread, so the app
  captures `chatId` from the `chat:location_update` / `chat:id_update` events and passes it back on
  remount. **Reset demo** deliberately omits it, starting a fresh thread.

## Verify

1. Confirm the real Glean logomark and Glean Blue accent — no Acme / named-hire chrome.
2. With `steps.json`, confirm pending/done lists and progress render.
3. Confirm both cards are the same height and the checklist scrolls inside its own card — the page
   itself should not scroll.
4. Ask **What should I do on my first day?** for a cited answer from your instance.
5. Ask a question, then click **Ask about this** on a step — the earlier turns should still be on
   screen, with the step's question appended.
6. Mark all steps complete — the done-state summary appears, listing your `resources.json` links (or
   the configure-this note if you skipped that file).
7. Click **Reset demo** from the done panel — the checklist returns and the chat starts fresh.

## Path note

This is Path A. For Path B (Client Chat), see [`../platform-chat/`](../platform-chat/).
