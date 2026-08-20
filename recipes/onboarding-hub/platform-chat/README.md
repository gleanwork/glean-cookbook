# Onboarding Hub — Client Chat path

Checklist + progress + Glean Client Chat. Steps are server-owned through env/file configuration and
remain empty until configured.
The app runs as you; there is no act-as / impersonation.

## Run

```bash
npm install
npm run login
# Then keep GLEAN_ONBOARDING_STEPS_FILE pointed at a JSON checklist.
npm run verify
npm start
```

`npm run login` creates `.env` and fills in `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN`. If OAuth is
off, copy `.env.example` to `.env` and fill those two yourself with a CHAT-scoped token.

Signing in does not pick a checklist. Keep `GLEAN_ONBOARDING_STEPS_FILE` pointed at
`./steps.example.json`, edit that file, or point it at one of your own. You can also set
`GLEAN_ONBOARDING_STEPS_JSON` instead. Without either, `/api/checklist` returns
`{ steps: [], source: "empty" }` and the UI asks you to configure steps.

Open the Local URL printed by the server. The server holds your API token. Never expose it in the
browser.

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
