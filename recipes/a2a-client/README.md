# a2a-client

Call a Glean agent from any A2A client — card discovery, `message/send`, multi-turn via `context_id`, and streaming.

> **Pin `a2a-sdk` below 1.0.** Glean's per-agent A2A server speaks A2A spec **0.3**. `a2a-sdk` 1.x targets a later revision and will not interoperate. This recipe pins `a2a-sdk==0.3.26`.

## Run it

```bash
node scripts/glean-auth.mjs login --scopes agents
# Set GLEAN_AGENT_ID and GLEAN_DEMO_QUERY in .env.
uv run main.py
```

The login command discovers your tenant from your work email and uses OAuth. If tenant OAuth is unavailable, put an `AGENTS`-scoped API token in the generated `.env`. The agent must be published and use a chat-message trigger; its ID appears in the Agent Builder URL.

Dependencies are declared inline ([PEP 723](https://peps.python.org/pep-0723/)) and locked,
so [uv](https://docs.astral.sh/uv/) installs them into an isolated environment on first run —
no `requirements.txt`, virtualenv, or activate step. Re-run `uv lock --script <script>` after
editing the inline dependencies.

The `markdown_output.py` helper centralizes terminal and pipeline output. By default, it renders
agent-authored Markdown with Rich on an interactive terminal and emits the Markdown source unchanged
when stdout is piped or redirected. Use `--format terminal` to force the Rich view or `--format
markdown` to force raw Markdown. It sanitizes terminal controls, keeps link destinations visible,
honors `NO_COLOR`, and adds a final newline when a document completes. Streaming accepts cumulative
snapshots, emits each unseen raw suffix once, and renders the complete terminal document only once.

## Client contract

Use `ClientFactory` and `Client.send_message()`; `A2AClient` is deprecated. `Client.send_message()` is an async iterator that selects streaming behavior from `ClientConfig(streaming=...)` and the server's capabilities.

## What this does

1. **Card discovery**: `A2ACardResolver` fetches `/rest/api/v1/a2a/agents/{agentId}/agent-card.json` from your Glean instance, with a bearer token attached via the `httpx.AsyncClient`'s headers.
2. **`message/send`**: a plain call via a `ClientConfig(streaming=False)` client.
3. **Multi-turn**: a follow-up message reusing the first response's `context_id`.
4. **Streaming**: a separate `ClientConfig(streaming=True)` client for a longer question. Each event is a cumulative snapshot of the answer. Raw Markdown mode writes only the unseen suffix of each snapshot; repeated snapshots write nothing. A later event that does not start with the prior snapshot fails clearly instead of being guessed to be a delta. Terminal mode buffers the final snapshot so Rich can render complete Markdown without corrupting partial blocks.

Response text lives at `message.parts[i].root.text` for direct `Message` replies. Task-based replies use `task.artifacts[].parts[].root.text`; `task.history` is only a fallback when no artifact text is present. `main.py`'s `unpack_event()` handles both shapes, though the targeted chat-message-trigger agent usually replies with a plain `Message`.
