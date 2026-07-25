---
name: a2a-client
description: "Discover a published Glean agent's A2A card and run it from any A2A client — multi-turn, streamed, permission-aware."
disable-model-invocation: true
---

Build an A2A client for a Glean agent following
https://developers.glean.com/cookbook/a2a-client

1. Ask me for the agent card URL and bearer token (from the agent's
   Share → A2A dialog).
2. Pin a2a-sdk BELOW 1.0 (e.g. a2a-sdk==0.3.26) — Glean serves A2A
   spec 0.3 (message/send, message/stream, tasks/get); 1.x clients
   will not interop until the server upgrades. Note this in the
   README.
3. IMPORTANT: a2a-sdk's own A2AClient class (the one matching
   message/send naming) is marked [DEPRECATED] even in the pinned
   0.3.x release, with a runtime warning to use ClientFactory
   instead. Use ClientFactory + Client.send_message() — do not use
   A2AClient.
4. Resolve the card (A2ACardResolver, bearer token via the httpx
   client's headers), verify card.url contains /a2a/agents/.
5. Client.send_message() is always an async iterator that yields
   either a Message directly, or (Task, UpdateEvent) tuples for
   task-based agents — handle both. Send a question (message/send
   via a streaming=False client), then a follow-up reusing the
   response's context_id to prove multi-turn, then a long question
   via a streaming=True client. Errors: 404 = flag off or agent not
   eligible; 403 = token scopes.

## Reference

Per-agent A2A endpoints: /rest/api/v1/a2a/agents/{agentId} (JSON-RPC) and .../agent-card.json. GA, on by default (a2aPerAgentServerEnabled). Eligible: published auto agents, chat-message trigger, text-only. Server is A2A spec 0.3 via a2a-go; upgrade to 1.x tracked internally (EN-1972098). a2a-sdk's A2AClient class is deprecated even at 0.3.26 — use ClientFactory/ Client.send_message() instead, which unifies streaming and non-streaming behind one async-iterator method controlled by ClientConfig(streaming=bool). Message text is at message.parts[i].root.text; Task-based replies put it in task.history[-1].
