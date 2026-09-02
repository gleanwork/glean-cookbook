# Streaming Chat with citations

Use the modern Platform Chat API to send a permission-aware question, continue the conversation, and read a streamed response through `glean.chat.createStream()`.

This recipe uses `@gleanwork/api-client` 0.20.2. Every turn calls `createStream()` and `for await`s the typed EventStream. It does not use the legacy `glean.client.chat` API, `stream` on `create()`, or a hand-written SSE parser.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with content indexed
- Your work email, or the complete Glean backend origin shown under **Server instance (QE)**
- A tenant that permits the public OAuth client and `chat` scope through DCR; an administrator-provisioned OAuth client or user-scoped `CHAT` token is the fallback

Platform Chat is experimental. The SDK opts in through `includeExperimental: true`.

## Install and test

```bash
npm install
npm test
npm run test:all
```

## Sign in

Use OAuth so the answer is evaluated with your own permissions:

```bash
npm run login -- --email "you@example.com"
```

The auth package stores refreshable credentials outside this project. You can also pass `--server-url` or set `GLEAN_SERVER_URL`. Set `GLEAN_API_TOKEN` only when using an explicit user-scoped token fallback.

## Stream one turn

```bash
npm run verify -- \
  --email "you@example.com" \
  --prompt "What is our PTO policy?"
```

`createStream` yields `RESPONSE_OUTPUT_TEXT_DELTA` text, then a `RESPONSE_COMPLETED` payload with `conversation_id` and citation annotations.

## Stream a follow-up

```bash
npm start -- \
  --email "you@example.com" \
  --prompt "What is our PTO policy?" \
  --follow-up "Who owns this policy?"
```

The follow-up sends `conversation_id` from the first stored turn. Omit `--follow-up` to run one turn.

## API sequence

- `glean.chat.createStream({ input, store: true })` returns a typed EventStream.
- `RESPONSE_OUTPUT_TEXT_DELTA` carries incremental text in `data.delta`.
- `RESPONSE_COMPLETED` carries the finished `PlatformChatCompletedResponse` in `data.response`.
- `output[].content[].annotations[]` contains citation sources and snippets.

Keep prompts grounded in content you know exists in your own Glean instance. The answer and citations depend on your permissions and indexed content.
