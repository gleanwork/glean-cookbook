# Streaming Chat with citations

Use the modern Platform Chat API to send a permission-aware question, continue the conversation, and read a streamed response through the SDK's `createStream` EventStream.

This recipe uses `@gleanwork/api-client` 0.20.2. JSON turns call `glean.chat.create()`. Streaming turns call `glean.chat.createStream()` and iterate the returned EventStream. It does not use the legacy `glean.client.chat` API, `stream` on `create()`, or hand-written Glean request construction.

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

## Run a typed response

```bash
npm run verify -- \
  --email "you@example.com" \
  --prompt "What is our PTO policy?"
```

The typed response includes `conversation_id`, assistant output text, and citation annotations with source URLs and snippets.

## Run the streamed response

```bash
npm start -- \
  --email "you@example.com" \
  --prompt "What is our PTO policy?" \
  --follow-up "Who owns this policy?" \
  --stream
```

`createStream` returns a typed EventStream. The recipe `for await`s events and writes `RESPONSE_OUTPUT_TEXT_DELTA.data.delta`, then reads citations from `RESPONSE_COMPLETED.data.response`. HTTP clients still set `stream: true` in the JSON body; SDK callers do not pass `stream` on `create()`. Fixture tests use MSW to intercept the SDK transport without a bespoke HTTP server.

The follow-up sends `conversation_id` returned by the first stored turn. Omit `--follow-up` to run one turn.

## API sequence

- `glean.chat.create({ input, store: true })` returns a typed JSON response.
- `glean.chat.createStream({ input, conversation_id, store: true })` returns an EventStream.
- `RESPONSE_OUTPUT_TEXT_DELTA` carries incremental text in `data.delta`.
- `RESPONSE_COMPLETED` carries the finished `PlatformChatCompletedResponse` in `data.response`.
- `output[].content[].annotations[]` contains citation sources and snippets.

Keep prompts grounded in content you know exists in your own Glean instance. The answer and citations depend on your permissions and indexed content.
