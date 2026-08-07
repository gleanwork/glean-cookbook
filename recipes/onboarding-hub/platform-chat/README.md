# Onboarding Hub — Client Chat path

Checklist + progress + Glean Client Chat. Steps are server-owned through env/file configuration and
remain empty until configured.
The app runs as you; there is no act-as / impersonation.

## Run

```bash
npm install
npm run login
# Customize steps.example.json, or point GLEAN_ONBOARDING_STEPS_FILE at your own file.
npm run verify
npm start
```

Open http://localhost:3000. The server holds your API token — never expose it in the browser.

- **Live steps:** `.env.example` selects the included multi-step `steps.example.json`. Customize it,
  point `GLEAN_ONBOARDING_STEPS_FILE` at another file, or set `GLEAN_ONBOARDING_STEPS_JSON`.
- **Empty:** without those env vars, `/api/checklist` returns `{ steps: [], source: "empty" }` and the UI asks you to configure steps.

## Verify

Requires credentials from `.env` or the shell and starts its own server.

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
