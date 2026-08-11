---
name: a2a-client
description: "Discover a published Glean agent's A2A card and run it from any A2A client — multi-turn, streamed, permission-aware."
disable-model-invocation: true
---

## Before you start

- A published auto agent with a chat-message trigger (text input only)
- Its agent id, from the Agent Builder URL or agents/search
- A work email for tenant discovery and OAuth sign-in; an AGENTS-scoped API token is the fallback
- uv (a2a-sdk is pinned < 1.0 — see below)

Build "Call a Glean agent from an A2A client" following https://developers.glean.com/cookbook/a2a-client

Ask these before running commands. Ask one at a time, waiting for each
answer before asking the next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What is the ID of the published agent to invoke?
- What question is that agent expected to answer from your content?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/a2a-client a2a-client
   ```

2. **Set credentials**
   Use the shipped login flow, then set GLEAN_AGENT_ID and GLEAN_DEMO_QUERY from the answers already supplied. Never implement authentication.

   ```bash
   cd a2a-client && node scripts/glean-auth.mjs login --scopes agents --email "<work-email>"
   ```

3. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd a2a-client && uv run main.py
   ```

   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.

4. **Verify**
   Use the question supplied up front. Confirm a real answer, a follow-up reusing the same context_id to prove multi-turn, and a streaming response — all three paths this recipe exercises.
