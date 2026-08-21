# Customer 360 — Platform Search + Chat path

Account workspace for the account you pick: evidence coverage, three compact
Search sections, and an above-the-fold assistant thread powered by Platform Chat.
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
API token that carries the **SEARCH** and **CHAT** scopes.

Signing in does not choose an account. Open `.env` and set `GLEAN_ACCOUNT_NAME`
to one of your own customers, spelled the way your Glean documents spell it —
that name is what the page searches for. It is not your Glean instance name.

Platform Search and Chat calls opt in to experimental APIs for you.

## Verify, then run

```bash
npm run verify
npm start
```

Open the Local URL printed by the server.

## Contracts

- Tiles: `glean.search.query` → `POST /api/search` (SDK `@gleanwork/api-client@0.19.0`)
- Chat: `glean.chat.create({ input, stream: false, store: false })`; parse `ASSISTANT`
  `OUTPUT_TEXT` content and citations from `annotations[].sources[]`.
- Token stays server-side — browser only calls `/api/account` and `/api/ask`.
- Auth: caller credential only (`GLEAN_SERVER_URL` + `GLEAN_API_TOKEN`); no act-as.
