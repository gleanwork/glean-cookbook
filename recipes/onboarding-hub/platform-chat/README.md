# Onboarding Hub — Client Chat path

Checklist + progress + Glean Client Chat. Steps are server-owned through env/file configuration and
remain empty until configured.
The app runs as you; there is no act-as / impersonation.

## Setup

```bash
npm install
npm run login
```

`npm run login` finds your Glean tenant from your work email, opens a browser
for you to approve access, and writes `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN`
into a new `.env`. If your tenant cannot use OAuth, skip that command: copy
`.env.example` to `.env` and fill in those two values yourself, using a Glean
API token that carries the **CHAT** scope.

Signing in does not pick a checklist. Open `.env` and keep
`GLEAN_ONBOARDING_STEPS_FILE` pointed at a JSON file of your first-week tasks.
The included `./steps.example.json` is enough to run the app. Edit that file,
or point the variable at one of your own. You can also set
`GLEAN_ONBOARDING_STEPS_JSON` instead. Without either, `/api/checklist` returns
`{ steps: [], source: "empty" }` and the UI asks you to configure steps.

## Verify, then run

```bash
npm run verify
npm start
```

Open the Local URL printed by the server. The server holds your API token —
never expose it in the browser.

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
