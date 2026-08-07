---
name: a2a-client
description: "Discover a published Glean agent's A2A card and run it from any A2A client — multi-turn, streamed, permission-aware."
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `AGENTS`
- A published auto agent with a chat-message trigger (text input only)
- Its agent id, from the Agent Builder URL or agents/search
- An OAuth access token or Glean API token with the AGENTS scope
- uv (a2a-sdk is pinned < 1.0 — see below)

Build "Call a Glean agent from an A2A client" following https://developers.glean.com/cookbook/a2a-client

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/a2a-client a2a-client
   ```

2. **Set credentials**
   Fill in GLEAN_INSTANCE, GLEAN_API_TOKEN, and GLEAN_AGENT_ID. Use an OAuth access token or Glean API token with the AGENTS scope.

   ```bash
   cd a2a-client && cp .env.example .env
   ```

3. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd a2a-client && uv run main.py
   ```

4. **Verify**
   Confirm a real answer to "Who owns the payments service?", a follow-up reusing the same context_id to prove multi-turn, and a streaming response — all three paths this recipe exercises.

## Reference

Use /rest/api/v1/a2a/agents/{agentId}/agent-card.json for discovery and the sibling JSON-RPC endpoint for message/send, message/stream, and tasks/get. The agent must be published, use a chat-message trigger, and be text-only. Use an AGENTS-scoped credential. Pin a2a-sdk to 0.3.26 and use ClientFactory with Client.send_message(); the server implements the 0.3 method names. Read task answers from task.artifacts[].parts[].root.text. Streaming events contain the accumulated answer, not deltas. Set an httpx timeout of at least 60 seconds.

## Authentication

Use the first available credential path:

1. **Glean OAuth:** ask for the user's work email and run:
   ```bash
   node <plugin-root>/scripts/resolve-backend.mjs <work-email>
   ```
   If `oauthAvailable` is true, register a public client through the returned backend's Dynamic
   Client Registration endpoint and use authorization code + PKCE. Reuse the client id and refresh
   token.
2. **External IdP OAuth:** if Glean OAuth is unavailable, ask whether the user's administrator has
   configured Okta, Azure AD, Google, or another IdP for Glean Client API access. Use that sign-in
   flow when available.
3. **Glean API token:** otherwise request a token carrying the scopes declared by the recipe.

Do not use client credentials for an end-user Client API integration. Keep access and refresh tokens
server-side.

## Verify

Treat the queries below as acceptance scenarios, not as assumptions about what every Glean instance
contains. For a live check, ask the user for an equivalent topic they know exists in their instance
and confirm the same response properties: grounding, citations, permission filtering, and explicit
no-answer behavior where applicable. Use fixture or automated checks for corpus-independent
behavior. Do not claim a live check passed when the required content, credentials, user session, or
user confirmation was unavailable.

- **Query:** "Who owns our most critical service?"
  **Expected:** The agent returns a non-empty answer via the A2A message/send response (a Message or Task, not an error), the scripted follow-up carries the same context_id proving multi-turn works, and the streamed turn prints its answer once rather than repeating it per event.
