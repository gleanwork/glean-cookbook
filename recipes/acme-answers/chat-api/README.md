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

- **answer text** — `fragments[].text` from `CONTENT`-type messages only, joined (a real response can include earlier `UPDATE`-type messages narrating search/read steps; joining those in too prepends "Searching…"/"Reading…" text to the answer)
- **citations** — `fragments[].citation.sourceDocument`, filtered to ones with a `title` and `url`, deduped by `url` (the same source is commonly cited by more than one fragment)

Three corrections worth calling out (verified live against a real Glean instance, not assumed):

1. The client is constructed with `instance` (or a full `serverURL` override) — **not** `domain`. One of the SDK's own bundled example files (`examples/src/startChat.example.ts`) uses `domain`, but that isn't a field on `SDKOptions` at all.
2. Citations are **not** a top-level `citedDocuments` field on the response, and the older per-message `message.citations[]` field is deprecated — on a live response it wasn't populated at all. Citations live per-fragment, in `fragment.citation.sourceDocument`.
3. Don't assume every message in the response is the answer — a real chat response can include step-narration messages ahead of the actual answer; filter to `messageType === 'CONTENT'`.

The API token never reaches the browser — only `server.ts` reads `GLEAN_API_TOKEN`.

## Contrast with Path A (web-sdk/)

Here you own every pixel of the UI and the request/response shape, at the cost of writing (a little) more code. See `../web-sdk/` for the alternative: `renderChat` ships Glean's full UI for free.
