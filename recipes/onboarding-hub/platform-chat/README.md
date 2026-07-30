# Onboarding Hub — Platform Chat path

Gamified onboarding checklist for Alex Kim plus Glean chat via Platform Chat (`POST /api/chat`).

## Run

```bash
npm install
cp .env.example .env   # fill in GLEAN_API_TOKEN and GLEAN_INSTANCE
npm start
```

Open http://localhost:3000. The server holds your API token — never expose it in the browser.

## Verify

**Fixture mode** (no live handler required — validates the OpenAPI response parser):

```bash
npm run verify:fixture
```

**Live mode** (requires a working experimental `/api/chat` handler on your instance):

```bash
GLEAN_USE_FIXTURE=false npm run verify
```

## Platform Chat contract

- Request: `{ "input": "<question>", "stream": false, "store": true }`
- Response: `output[0].content[0].text` + `annotations[].sources[]`
- Header: `X-GLEAN-INCLUDE-EXPERIMENTAL=true`
- Platform scope: `CHAT_WRITE` (documented in registry `llmContext`)

When `@gleanwork/api-client` ships `glean.chat.create`, swap the `fetch` call in `server.ts` for the generated SDK method — the response parsing stays the same.

## Path note

This is Path B. For Path A (Web SDK `renderChat`), see [`../web-sdk/`](../web-sdk/).
