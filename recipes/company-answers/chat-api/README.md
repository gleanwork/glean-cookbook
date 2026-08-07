# company-answers / chat-api

Path B of the [Company Answers](https://developers.glean.com/cookbook/company-answers) recipe — you own the UI, the server owns the API token.

## Run it

```bash
npm install
npm run login
# Set GLEAN_DEMO_QUERY in .env to a topic you know exists.
npm run verify
npm start
```

Open `http://localhost:3000`, ask a question, get a cited answer.

## What this does

`server.ts` is a small Node HTTP server: `GET /` serves `public/index.html`; `POST /api/ask` calls `glean.client.chat.create` from `@gleanwork/api-client` with the question as a single `USER` message, then extracts:

- **answer text** — `fragments[].text` from `CONTENT`-type messages only, joined (a real response can include earlier `UPDATE`-type messages narrating search/read steps; joining those in too prepends "Searching…"/"Reading…" text to the answer)
- **citations** — `fragments[].citation.sourceDocument`, filtered to ones with a `title` and `url`, deduped by `url` (the same source is commonly cited by more than one fragment)

The current API contract has three important details:

1. Construct the client with `instance` or a full `serverURL` override.
2. Citations live per-fragment in `fragment.citation.sourceDocument`; do not use a top-level `citedDocuments` field or deprecated `message.citations[]`.
3. Don't assume every message in the response is the answer — a real chat response can include step-narration messages ahead of the actual answer; filter to `messageType === 'CONTENT'`.

The API token never reaches the browser — only `server.ts` reads `GLEAN_API_TOKEN`.

## Contrast with Path A (web-sdk/)

Here you own every pixel of the UI and the request/response shape, at the cost of writing (a little) more code. See `../web-sdk/` for the alternative: `renderChat` ships Glean's full UI for free.
