---
name: customer-360
description: 'One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.'
disable-model-invocation: true
---

Build "Customer 360: an account page built from your own content" following https://developers.glean.com/cookbook/customer-360

1. **Pick a path**
   Path A (Platform Search + Chat) builds an open-ended explorable dashboard: parallel search.query tiles and POST /api/chat for journey summary and saved prompts. Path B (Platform Agents) keeps the same page UX but runs synthesis through glean.agents.createRun against a template Account Brief agent.

## Reference

Platform-only recipe. Search: glean.search.query -> POST /api/search, results[].title/url/snippets (string[]). Chat: fetch POST /api/chat (until glean.chat.create ships); request {input, stream:false, store:true}; response output[].content[] type=output_text with annotations[].sources[]. Agents: glean.agents.createRun(request, agentId) -> POST /api/agents/{agent_id}/runs; stream:false returns PlatformAgentRunWaitResponse synchronously (no polling); messages use role USER|GLEAN_AI and content[{text,type:text}]. Experimental opt-in via X_GLEAN_INCLUDE_EXPERIMENTAL. Do NOT teach glean.client.chat.create, glean.client.search.query, or glean.client.agents.run. Tokens server-side only. The account and its facts come from the reader's own instance: nothing here may hardcode an account name, ARR, seat count or renewal date. An earlier draft of this recipe was written against a demo corpus that no longer exists, which made the page display one fictional customer's numbers regardless of what was retrieved. Treat an empty retrieval as a first-class state and render it as such -- for an app that speaks about named customers, an uncited claim is worse than a blank field.

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

- **Query:** "What's the status of our renewal with that account?"
  **Expected:** Returns a non-empty answer citing real documents about the account you built the page around. Substitute the account name when you ask it — the page is built around whichever one you pick, so there is no fixed query text here.
- **Query:** "Give me a customer summary"
  **Expected:** Synthesizes across more than one source, with a citation per claim, rather than restating a single document.
- **Query:** "What are the renewal risks?"
  **Expected:** Either names risks grounded in cited content, or says it has none to report. It must not infer risk the sources don't support — an account with no recorded risk is a real answer, not a gap to fill.
