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

Glean supports three ways to get a Client API credential. Try them in this order — don't assume
one over the others, since which are available depends on how the tenant is configured:

1. **Glean OAS (Glean's own OAuth Authorization Server)** — the most flexible, self-service
   option, and the one to try first. It's disabled by default per-tenant, so detect it rather
   than assume:
   - Ask for the user's work email — not a raw backend URL. Resolve their tenant and check OAuth
     availability with `resolve-backend.mjs`, bundled alongside this plugin's skills (a sibling of
     the `skills/` directory, under `scripts/`) — locate it and run it, don't hand-derive the
     `config/search` call or the `.well-known/oauth-authorization-server` check from memory, since
     getting either wrong silently resolves to the wrong tenant or the wrong auth path. Its
     invocation is:
     ```bash
     node <path-to-this-plugin>/scripts/resolve-backend.mjs <their work email>
     ```
     Prints `{"instance", "backend", "oauthAvailable"}` — `backend` is the real Client API
     backend (verified live for a `glean.com` email, resolves to `scio-prod-be.glean.com`, and for
     at least one real customer domain), and `oauthAvailable` tells you whether to continue with
     Glean OAS below or fall back to option 2.
   - If `oauthAvailable` is `true` — use `authorization_code` + PKCE (verified live against
     `scio-prod-be.glean.com`: this is the grant Glean's own docs call "the recommended
     authentication method for Client API integrations," and what MCP hosts already use for
     their own sign-in flow). Do **not** use `client_credentials` even though it appears in
     `grant_types_supported` — a general client-credentials/service-account flow for the Client
     API is explicitly not yet a supported path for this kind of integration. If registration or
     the token exchange itself fails downstream, that also means Glean OAS isn't usable for this
     tenant; move to option 2.
   - Get a `client_id` via **Dynamic Client Registration** — the metadata's
     `registration_endpoint` (verified live: `POST {backend}/oauth/register` with `client_name`,
     `redirect_uris`, `grant_types: ["authorization_code", "refresh_token"]`,
     `response_types: ["code"]`, `token_endpoint_auth_method: "none"` returns `201` with a real
     `client_id`, no admin pre-approval needed). This is the same mechanism real MCP hosts
     already use to connect to Glean — self-service, not something that requires the end user or
     their IT admin to pre-register a Static OAuth Client first. Register once per app, reuse the
     `client_id` for every subsequent login from that app.
   - Complete the `authorization_code` + PKCE exchange with that `client_id` — a real browser
     login (the user signs in via their normal SSO), then exchange the returned code at
     `{backend}/oauth/token` for an access token + `refresh_token`. Use the refresh token to
     avoid repeating the interactive login on every run.
2. **IdP OAuth** — the customer's own identity provider (Okta, Azure AD, Google, etc.) issues the
   token instead of Glean's own authorization server. This is admin-configured on the customer's
   side, not something discoverable or self-service the way Glean OAS is — if Glean OAS isn't
   enabled, ask the user whether their Glean admin has set up OAuth with an external IdP, and if
   so get an access token via that IdP-integrated sign-in flow rather than guessing at one.
3. **Glean Token** — least preferred, most cumbersome: the user needs either an admin to grant
   them a token, or the API Token Creator role themselves. Fall back to this only after ruling out
   both OAuth options above, by asking for an API token with the scope the recipe needs.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "Who owns our most critical service?"
  **Expected:** The agent returns a non-empty answer via the A2A message/send response (a Message or Task, not an error), the scripted follow-up carries the same context_id proving multi-turn works, and the streamed turn prints its answer once rather than repeating it per event.
