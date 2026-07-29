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

2. **Install dependencies**
   Pins a2a-sdk below 1.0 — Glean serves A2A spec 0.3 today; 1.x clients won't interop until the server upgrades.

   ```bash
   cd a2a-client && pip install -r requirements.txt
   ```

3. **Set credentials**
   Fill in GLEAN_A2A_CARD_URL and GLEAN_A2A_TOKEN from the agent's Share → A2A dialog — this is a per-agent bearer token, not the general Glean OAuth/token chain.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   python main.py
   ```

5. **Verify**
   Confirm a real answer to "Who owns the payments service?", a follow-up reusing the same context_id to prove multi-turn, and a streaming response — all three paths this recipe exercises.

## Reference

Per-agent A2A endpoints: /rest/api/v1/a2a/agents/{agentId} (JSON-RPC) and .../agent-card.json. GA, on by default (a2aPerAgentServerEnabled). Eligible: published auto agents, chat-message trigger, text-only. Server is A2A spec 0.3 via a2a-go; upgrade to 1.x tracked internally (EN-1972098). a2a-sdk's A2AClient class is deprecated even at 0.3.26 — use ClientFactory/ Client.send_message() instead, which unifies streaming and non-streaming behind one async-iterator method controlled by ClientConfig(streaming=bool). Message text is at message.parts[i].root.text; Task-based replies put it in task.history[-1].
