# Customer 360 — Platform Search + Chat path

Account page for the account you pick: KPI header, three Search tiles, journey
summary via Platform Chat, saved-prompt buttons, and drill-in chat. The app runs
as you; there is no act-as / impersonation.

## Setup

```bash
npm install
cp .env.example .env
```

Fill `GLEAN_SERVER_URL` / `GLEAN_API_TOKEN` / `GLEAN_ACCOUNT_NAME`, and ensure
experimental Platform Search + Chat are enabled on the instance
(`X_GLEAN_INCLUDE_EXPERIMENTAL=true`).

## Run

```bash
npm start
```

Open http://localhost:3000.

## Verify

```bash
npm run verify
```

## Contracts

- Tiles: `glean.search.query` → `POST /api/search` (SDK `@gleanwork/api-client@0.18.0`)
- Chat: server-side `POST /api/chat` with `{ input, stream: false, store: true }`
  (fetch until `glean.chat.create` ships). Parse `output_text` + citation sources.
- Token stays server-side — browser only calls `/api/account` and `/api/chat`.
- Auth: caller credential only (`GLEAN_SERVER_URL` + `GLEAN_API_TOKEN`); no act-as.
