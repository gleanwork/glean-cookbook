# acme-answers / chat-api

Path B of the [Acme Answers](../../../docs/cookbook/acme-answers.mdx) recipe — you own the UI, the server owns the API token.

## Run it

```bash
npm install
cp .env.example .env   # fill in GLEAN_API_TOKEN and GLEAN_INSTANCE
npm start
```

Open `http://localhost:3000`, ask a question, get a cited answer.

## What this does

`server.ts` is a small Node HTTP server: `GET /` serves `public/index.html`; `POST /api/ask` calls `glean.client.chat.create` from `@gleanwork/api-client` with the question as a single `USER` message, then extracts:

- **answer text** — every message's `fragments[].text`, joined
- **citations** — every message's `citations[].sourceDocument`, filtered to ones with a `title` and `url`

Two corrections worth calling out (verified against the pinned `@gleanwork/api-client@0.18.0` types, not assumed):

1. The client is constructed with `instance` (or a full `serverURL` override) — **not** `domain`. One of the SDK's own bundled example files (`examples/src/startChat.example.ts`) uses `domain`, but that isn't a field on `SDKOptions` at all.
2. Citations are **not** a top-level `citedDocuments` field on the response. They live per-message, in `message.citations[]`.

The API token never reaches the browser — only `server.ts` reads `GLEAN_API_TOKEN`.

## Contrast with Path A (web-sdk/)

Here you own every pixel of the UI and the request/response shape, at the cost of writing (a little) more code. See `../web-sdk/` for the alternative: `renderChat` ships Glean's full UI for free.
