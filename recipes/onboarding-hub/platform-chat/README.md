# Onboarding Hub — Platform Chat path

Checklist + progress + Glean Platform Chat. Steps are server-owned through env/file configuration.
The app runs as you; there is no act-as / impersonation.

## Setup

```bash
npm install
npm run login
```

`npm run login` finds your Glean tenant from your work email, opens a browser for you to approve
access, and writes `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN` into a new `.env`. If your tenant cannot
use OAuth, skip that command: copy `.env.example` to `.env` and fill in those two values yourself,
using a Glean API token that carries the **CHAT** scope.

`.env` already points at the included `steps.json`, so you can run with the sample.
Customize that file if you want your own onboarding program, or point
`GLEAN_ONBOARDING_STEPS_FILE` at another file, or set `GLEAN_ONBOARDING_STEPS_JSON`.
Without those, `/api/checklist` returns `{ steps: [], source: "empty" }` and the UI asks you to
configure steps.

## Verify, then run

```bash
npm run verify
npm start
```

Open the Local URL printed by the server. The server holds your API token — never expose it in the
browser.

`npm run verify:fixture` runs the same checks against recorded Sample Corp answers and needs no
credentials.

## Platform Chat contract

- Request: `glean.chat.create({ input, stream: false, store: false })` with
  `X_GLEAN_INCLUDE_EXPERIMENTAL=true`
- Answer text: `ASSISTANT` messages with `OUTPUT_TEXT` content
- Citations: `OUTPUT_TEXT.annotations[].sources[]`
- Auth: caller credential only (`GLEAN_SERVER_URL` + `GLEAN_API_TOKEN`); no act-as
- Empty answer text retries once, then returns a transport error

## Path note

This is Path B. For Path A (Web SDK `renderChat`), see [`../web-sdk/`](../web-sdk/).
