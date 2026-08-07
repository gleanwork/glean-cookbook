# Onboarding Hub — Client Chat path

Checklist + progress + Glean Client Chat. Steps are
server-owned via env/file config, or empty — not a hardcoded named hire.
The app runs as you; there is no act-as / impersonation.

## Run

```bash
npm install
cp .env.example .env     # fill in GLEAN_API_TOKEN and GLEAN_SERVER_URL
# Required for a non-empty checklist:
#   GLEAN_ONBOARDING_STEPS_FILE=./steps.example.json
#   # or GLEAN_ONBOARDING_STEPS_JSON='[...]'
npm start
```

Open http://localhost:3000. The server holds your API token — never expose it in the browser.

- **Live steps:** set `GLEAN_ONBOARDING_STEPS_FILE` or `GLEAN_ONBOARDING_STEPS_JSON` (see `steps.example.json`).
- **Empty:** without those env vars, `/api/checklist` returns `{ steps: [], source: "empty" }` and the UI asks you to configure steps.

## Verify

Requires credentials from `.env` or the shell. Stop `npm start` first (Ctrl-C);
verify starts its own server on the same port.

```bash
npm run verify
```

## Client Chat contract

- Request: `POST /rest/api/v1/chat` with `saveChat: false` and a USER message fragment
- Answer text: `CONTENT` messages from `GLEAN_AI`
- Citations: `fragments[].citation.sourceDocument`
- Auth: caller credential only (`GLEAN_SERVER_URL` + `GLEAN_API_TOKEN`); no act-as
- Empty answer text retries once, then returns a transport error

## Path note

This is Path B. For Path A (Web SDK `renderChat`), see [`../web-sdk/`](../web-sdk/).
