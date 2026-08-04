# Customer 360 — Platform Search + Chat path

an account owner's the account you pick account page: KPI header, three Search tiles, journey
summary via Platform Chat, saved-prompt buttons, and drill-in chat.

## Setup

```bash
cp .env.example .env
npm install
```

Set `GLEAN_USE_FIXTURE=true` for contract-only runs (default in `.env.example`).
For live mode, fill `GLEAN_SERVER_URL` / `GLEAN_API_TOKEN`, set
`GLEAN_USE_FIXTURE=false`, and ensure experimental Platform Search + Chat are
enabled on the instance (`X_GLEAN_INCLUDE_EXPERIMENTAL=true`).

## Run

```bash
npm start
```

Open http://localhost:3000.

## Verify

```bash
npm run verify:fixture
```

## Contracts

- Tiles: `glean.search.query` → `POST /api/search` (SDK `@gleanwork/api-client@0.18.0`)
- Chat: server-side `POST /api/chat` with `{ input, stream: false, store: true }`
  (fetch until `glean.chat.create` ships). Parse `output_text` + citation sources.
- Token stays server-side — browser only calls `/api/account` and `/api/chat`.
