# Streaming Chat with citations

Use the modern Platform Chat API to send a permission-aware question, continue the conversation, and read a streamed response through `glean.chat.createStream()`.

This recipe uses `@gleanwork/api-client` 0.20.12. Every turn calls `createStream()` and `for await`s the typed `EventStream`. It does not use the legacy `glean.client.chat` API, `stream` on `create()`, or a hand-written SSE parser.

## Prerequisites

- Node.js 22.12.0 or newer. The steps use `npx` and `npm`. Install Node from [nodejs.org](https://nodejs.org) if needed.
- A Glean instance with content indexed
- Your work email, or the complete Glean backend HTTPS origin
- Permission to use Chat through the `CHAT` OAuth scope or a user-scoped token

Platform Chat is experimental. The SDK opts in through `includeExperimental: true`.

## Install and test

```bash
npm install
npm test
npm run test:all
```

## Sign in with dynamic client registration

The official auth package discovers your instance, registers the OAuth client
dynamically, and stores credentials securely. Sign in so the answer is evaluated
with your own permissions:

```bash
npm run login -- --email "you@example.com"
```

Complete authorization in your browser and wait for the command to report success. You can also pass `--server-url` or set `GLEAN_SERVER_URL`.

If OAuth is not available, set a user-scoped `GLEAN_API_TOKEN` with the `CHAT` permission.

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

- `glean.chat.createStream({ input, store: true })` returns a typed `EventStream`.
- `RESPONSE_OUTPUT_TEXT_DELTA` carries incremental text in `data.delta`.
- `RESPONSE_COMPLETED` carries the finished `PlatformChatCompletedResponse` in `data.response`.
- `output[].content[].annotations[]` contains citation sources and snippets.

Keep prompts grounded in content you know exists in your own Glean instance. The answer and citations depend on your permissions and indexed content.
