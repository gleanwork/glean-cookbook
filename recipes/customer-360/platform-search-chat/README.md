# Customer 360 — Platform Search + Chat path

Account page for the account you pick: KPI header, three Search tiles, journey
summary via Client Chat, saved-prompt buttons, and drill-in chat. The app runs
as you; there is no act-as / impersonation.

## Setup

```bash
npm install
cp .env.example .env
```

Fill `GLEAN_SERVER_URL` / `GLEAN_API_TOKEN` / `GLEAN_ACCOUNT_NAME`. Platform Search
uses `X_GLEAN_INCLUDE_EXPERIMENTAL=true`.

## Run

```bash
npm start
```

Open http://localhost:3000.

## Verify

Credentials come from `.env` or the shell (same as `npm start`). Stop `npm start`
first (Ctrl-C); verify starts its own server on the same port.

```bash
npm run verify
```

## Contracts

- Tiles: `glean.search.query` → `POST /api/search` (SDK `@gleanwork/api-client@0.18.0`)
- Chat: server-side `POST /rest/api/v1/chat`. Parse `CONTENT` messages from
  `GLEAN_AI` and citations from `fragments[].citation.sourceDocument`.
- Token stays server-side — browser only calls `/api/account` and `/api/chat`.
- Auth: caller credential only (`GLEAN_SERVER_URL` + `GLEAN_API_TOKEN`); no act-as.
