# a2a-client

Call a Glean agent from any A2A client — card discovery, `message/send`, multi-turn via `context_id`, and streaming.

> **Pin `a2a-sdk` below 1.0.** Glean's per-agent A2A server speaks A2A spec **0.3**. `a2a-sdk` 1.x targets a later revision and will not interoperate. This recipe pins `a2a-sdk==0.3.26`.

## Run it

```bash
cp .env.example .env   # fill in GLEAN_INSTANCE, GLEAN_API_TOKEN, and GLEAN_AGENT_ID
uv run main.py
```

Use an OAuth access token or Glean API token with the `AGENTS` scope. The agent must be published and use a chat-message trigger; its ID appears in the Agent Builder URL.

Dependencies are declared inline ([PEP 723](https://peps.python.org/pep-0723/)) and locked,
so [uv](https://docs.astral.sh/uv/) installs them into an isolated environment on first run —
no `requirements.txt`, virtualenv, or activate step. Re-run `uv lock --script <script>` after
editing the inline dependencies.

## Client contract

Use `ClientFactory` and `Client.send_message()`; `A2AClient` is deprecated. `Client.send_message()` is an async iterator that selects streaming behavior from `ClientConfig(streaming=...)` and the server's capabilities.

## What this does

1. **Card discovery**: `A2ACardResolver` fetches `/rest/api/v1/a2a/agents/{agentId}/agent-card.json` from your Glean instance, with a bearer token attached via the `httpx.AsyncClient`'s headers.
2. **`message/send`**: a plain call via a `ClientConfig(streaming=False)` client.
3. **Multi-turn**: a follow-up message reusing the first response's `context_id`.
4. **Streaming**: a separate `ClientConfig(streaming=True)` client for a longer question.

Response text lives at `message.parts[i].root.text` (a discriminated union of `TextPart`/`FilePart`/`DataPart`) for direct `Message` replies, or in `task.history[-1]` for task-based agents — `main.py`'s `unpack_event()` handles both, though a simple chat-message-trigger agent (what this recipe targets) replies with a plain `Message`.
