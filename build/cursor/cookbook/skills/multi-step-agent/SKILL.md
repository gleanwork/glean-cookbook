---
name: multi-step-agent
description: 'Build a Glean agent that plans, retrieves, and acts through a governed custom tool — with a safe fallback when the tool is denied.'
disable-model-invocation: true
---

Build "Multi-step agent with governed tools" following https://developers.glean.com/cookbook/multi-step-agent

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/multi-step-agent multi-step-agent
   ```

2. **Run the tool server**
   Listens on port 8080. Keep this running in its own terminal — the agent calls it over HTTP once registered.

   ```bash
   cd multi-step-agent/tool-server && uv run server.py
   ```

3. **Register the tool**
   Manual, UI-only step — there is no API to create a tool. In Admin > Platform > Tools > Add, register the tool and upload multi-step-agent/tool-server/openapi.yaml as its API spec.

4. **Create the agent**
   Manual, UI-only step. In Agent Builder: paste the recipe's instructions, turn retrieval on, attach the tool you just registered. Copy the agent's ID for the next step.

5. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and GLEAN_AGENT_ID (the ID from the previous step).

   ```bash
   cd multi-step-agent/invoke-agent && cp .env.example .env
   ```

6. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd multi-step-agent/invoke-agent && uv run main.py
   ```

7. **Verify**
   Run as a user in the permitted group and confirm the ticket actually gets filed; run as a non-permitted user and confirm a graceful no-write fallback summary instead of a hard failure.

## Reference

Agents API: glean.client.agents.run(agent_id, messages, http_headers) -> AgentRunWaitResponse{run.status, messages}. messages use Message(role, content=[MessageTextBlock(text, type=ContentType.TEXT)]) — distinct from chat.create's ChatMessage/ChatMessageFragment. run_stream() returns a raw SSE string, not an iterator. Tools are registered via the admin console (upload an OpenAPI spec), not an API call. Per-user identity for a run uses the X-Glean-Act-As header on a global/admin token, same as Search. Custom tool servers receive the acting user's email via the Glean-User-Email header, which is where tool-level authorization (governance) is actually enforced for scratch-built tools.

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

- **Query:** "Summarize our open incidents and file a tracking ticket"
  **Expected:** Run as a user in the permitted group: the agent summarizes and the governed tool call succeeds (200, a real ticket id). Run as a user outside it: the tool returns 403 and the agent falls back to a read-only summary rather than failing the run. The governance check must actually fire, not be assumed.
