# Streaming Chat with citations

Use the modern Platform Chat API to send a permission-aware question, continue the conversation, and read a streamed response through `glean.chat.createStream()`.

This recipe uses `@gleanwork/api-client` 0.20.14. Every turn calls `createStream()` and `for await`s the typed `EventStream`. It does not use the legacy `glean.client.chat` API, `stream` on `create()`, or a hand-written SSE parser.

## Prerequisites

- Node.js 22.12.0 or newer. The steps use `npx` and `npm`. Install Node from [nodejs.org](https://nodejs.org) if needed.
- A Glean instance with content indexed
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that permits the public OAuth client and `chat` scope through DCR

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

The auth package stores refreshable credentials outside this project. You can also pass `--server-url` or set `GLEAN_SERVER_URL`. If DCR is restricted, set `GLEAN_OAUTH_CLIENT_ID` for an administrator-provisioned public client.

If OAuth is not available, set `GLEAN_API_TOKEN` as a user-scoped fallback.

## Run one streamed turn

```bash
npm run verify -- \
  --email "you@example.com" \
  --prompt "What is our PTO policy?"
```

`createStream` yields `RESPONSE_OUTPUT_TEXT_DELTA` text, then a `RESPONSE_COMPLETED` payload with `conversation_id` and citation annotations. When the resolved format is raw Markdown, the CLI writes each delta to stdout unchanged and exactly once as it arrives, then adds a final newline only when the accumulated document needs one. In terminal-rendered mode, it buffers the complete answer, renders it once with `marked-terminal`, and then prints citations in a separate `Sources` section.

Output defaults to `--format auto`: an interactive TTY gets buffered terminal rendering, while a pipe or redirect gets the original Markdown deltas incrementally. Use `--format terminal` or `--format markdown` to override detection. Terminal mode removes ANSI, OSC, and other unsafe C0/C1 controls from the model answer and citation metadata while preserving newlines and tabs. Citation titles, URLs, and snippets remain plain text and are not parsed as Markdown. The output module leaves raw Markdown syntax unchanged and gives complete documents a conventional final newline. `NO_COLOR` disables renderer colors.

## Run a streamed follow-up

```bash
npm start -- \
  --email "you@example.com" \
  --prompt "What is our PTO policy?" \
  --follow-up "Who owns this policy?"
```

The follow-up sends `conversation_id` from the first stored turn. Omit `--follow-up` to run one turn.

## Handle failures

`src/main.ts` catches failures at the process boundary and delegates to `formatSdkError`:

- Platform problem details include the HTTP status, stable error code, request ID, and `Retry-After` when present.
- Generic SDK HTTP errors retain their status and message.
- Timeout and connection failures get actionable transport-specific guidance.

The formatter reports diagnostics without printing access tokens or other credential material. The fixture tests cover each branch without making network requests.

## API sequence

- `glean.chat.createStream({ input, store: true })` returns a typed `EventStream`.
- `RESPONSE_OUTPUT_TEXT_DELTA` carries incremental text in `data.delta`; raw mode writes each delta immediately, while terminal mode accumulates the complete Markdown document.
- `RESPONSE_COMPLETED` carries the finished `PlatformChatCompletedResponse` in `data.response`; terminal rendering happens only after this event.
- `output[].content[].annotations[]` contains citation sources and snippets.

Keep prompts grounded in content you know exists in your own Glean instance. The answer and citations depend on your permissions and indexed content.

See the [Platform Chat API](https://developers.glean.com/api/platform-api/chat-overview) and [Create a chat response](https://developers.glean.com/api/platform-api/platform-chat-create).
