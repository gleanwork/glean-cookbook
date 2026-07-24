# a2a-client

Call a Glean agent from any A2A client — card discovery, `message/send`, multi-turn via `context_id`, and streaming.

> **Pin `a2a-sdk` below 1.0.** Glean's per-agent A2A server speaks A2A spec **0.3** today. `a2a-sdk` 1.x targets a later spec revision and will not interoperate until the server upgrades (tracked internally as EN-1972098). This recipe pins `a2a-sdk==0.3.26` — the newest 0.3.x release.

## Run it

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in GLEAN_A2A_CARD_URL and GLEAN_A2A_TOKEN, from the agent's Share → A2A dialog
python main.py
```

## A correction worth knowing about

`a2a-sdk`'s own `A2AClient` class — the one whose method names literally match `message/send`/`message/stream` — is marked `[DEPRECATED]` **even in the pinned 0.3.26 release**, with a runtime warning to use `ClientFactory` instead. This recipe uses `ClientFactory` + `Client.send_message()` throughout, verified to raise no deprecation warning. One consequence: `Client.send_message()` is always an async iterator that auto-selects streaming vs non-streaming based on `ClientConfig(streaming=...)` and the server's capabilities — there's no separate method to call for streaming, just a different client config.

## What this does

1. **Card discovery**: `A2ACardResolver` fetches the agent card from the URL in your `.env`, with a bearer token attached via the `httpx.AsyncClient`'s headers.
2. **`message/send`**: a plain call via a `ClientConfig(streaming=False)` client.
3. **Multi-turn**: a follow-up message reusing the first response's `context_id`.
4. **Streaming**: a separate `ClientConfig(streaming=True)` client for a longer question.

Response text lives at `message.parts[i].root.text` (a discriminated union of `TextPart`/`FilePart`/`DataPart`) for direct `Message` replies, or in `task.history[-1]` for task-based agents — `main.py`'s `unpack_event()` handles both, though a simple chat-message-trigger agent (what this recipe targets) replies with a plain `Message`.
