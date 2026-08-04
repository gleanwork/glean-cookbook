---
name: a2a-client
description: "Discover a published Glean agent's A2A card and run it from any A2A client — multi-turn, streamed, permission-aware."
disable-model-invocation: true
---

Build "Call a Glean agent from an A2A client" following https://developers.glean.com/cookbook/a2a-client

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/a2a-client a2a-client
   ```

2. **Set credentials**
   Fill in GLEAN_A2A_CARD_URL and GLEAN_A2A_TOKEN from the agent's Share → A2A dialog — this is a per-agent bearer token, not the general Glean OAuth/token chain.

   ```bash
   cp .env.example .env
   ```

3. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd a2a-client && uv run main.py
   ```

4. **Verify**
   Confirm a real answer to "Who owns the payments service?", a follow-up reusing the same context_id to prove multi-turn, and a streaming response — all three paths this recipe exercises.

## Reference

Per-agent A2A endpoints: /rest/api/v1/a2a/agents/{agentId} (JSON-RPC) and .../agent-card.json. Verified live. An ordinary credential with the AGENTS scope is enough for both card discovery and message/send -- a per-agent token from the agent's Share dialog also works but is not required. Eligible agents: published auto agents, chat-message trigger, text-only; most agents on an instance return 404 for the card. CRITICAL version trap: the agent card advertises protocolVersion 1.0, but the server only implements the 0.3 JSON-RPC method names (message/send, message/stream, tasks/get). Verified by probing directly: SendMessage, v1/SendMessage and a2a.v1.A2AService/SendMessage all return -32601 method not found. So a2a-sdk must be pinned < 1.0 -- 1.x emits the 1.0 names and every call fails. a2a-sdk 1.x also replaced the Pydantic types with protobuf ones, so it is a migration rather than a bump. a2a-sdk's A2AClient class is deprecated even at 0.3.26 -- use ClientFactory / Client.send_message() instead, which unifies streaming and non-streaming behind one async-iterator method controlled by ClientConfig(streaming=bool). Task replies put the answer in task.artifacts[].parts[].root.text, NOT task.history[-1]: history held only the message we sent, so reading history[-1] echoes the user's own question back as the answer. Streaming events carry the answer accumulated so far rather than a delta, so print the difference or the whole answer repeats once per event. Set an explicit httpx timeout: the 5s default is far below the 20-60s a real agent takes, and it surfaces as an opaque client timeout.

## Authentication

{{> auth-client-api}}

## Verify

{{> verify-gate}}

- **Query:** "Who owns our most critical service?"
  **Expected:** The agent returns a non-empty answer via the A2A message/send response (a Message or Task, not an error), the scripted follow-up carries the same context_id proving multi-turn works, and the streamed turn prints its answer once rather than repeating it per event.
