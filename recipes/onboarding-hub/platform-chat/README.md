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

Aligned with `scio/openapi/public/platform/chat.yaml` (`ChatCreateRequest` / `ChatCompletedResponse`):

- Request: `{ "input": "<question>", "stream": false, "store": true }`
- Response (required): `id` (`resp_<uuid4>`), `object: "response"`, `created_at`, `status: "completed"`, `output`, `store`, `request_id`
- Answer text: `output[0].content[0].text` where `type` is `output_text`
- Citations: `annotations[].type == "citation"` → `sources[]` (`document` sources use `document_id` and/or `url`, plus optional `title`)
- Header: `X-GLEAN-INCLUDE-EXPERIMENTAL=true`
- Platform scope: `CHAT` (see registry `requiredScopes` / `llmContext`)

`fixtures/chat-response.json` is a complete sample of that response. `npm run verify:fixture` asserts the fixture shape before exercising the parser.

When `@gleanwork/api-client` ships `glean.chat.create`, swap the `fetch` call in `server.ts` for the generated SDK method — the response parsing stays the same.

## Path note

This is Path B. For Path A (Web SDK `renderChat`), see [`../web-sdk/`](../web-sdk/).
