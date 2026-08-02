---
name: permissions-aware-rag
description: "Use Glean's Platform API as the retrieval layer for your own LLM app — every chunk ACL-filtered per user before it ever reaches the model."
disable-model-invocation: true
---

Build "Permissions-aware RAG" following https://developers.glean.com/cookbook/permissions-aware-rag

1. **Pick a language**
   Both variants implement the same flow — pick whichever fits your app's stack.

### Python

Platform API search.query → snippets → LLM with citations

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-rag/python permissions-aware-rag
   ```

2. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and ANTHROPIC_API_KEY, then export them into your shell — unlike the TypeScript variant, this one reads the environment directly and does not load .env automatically.

   ```bash
   cp .env.example .env
   ```

3. **Run it**
   Dependencies are declared inline in main.py (PEP 723), so uv resolves and installs them into an isolated environment on first run — there's no requirements.txt, venv, or activate step.

   ```bash
   cd permissions-aware-rag && uv run main.py "What's our PTO policy?"
   ```

4. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Then ask for something another team owns: retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

### TypeScript

Same flow in TypeScript

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-rag/typescript permissions-aware-rag
   ```

2. **Install dependencies**

   ```bash
   cd permissions-aware-rag && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and ANTHROPIC_API_KEY — loaded automatically via dotenv in this variant.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   npm start -- "What's our PTO policy?"
   ```

5. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Then ask for something another team owns: retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

## Reference

Platform API search (data-first retrieval, distinct from the Client API's glean.client.search.query): glean.search.query(query, page_size, http_headers) -> PlatformSearchResponse. Result shape: results[].title, results[].url, results[].snippets (string[], not snippet objects). Experimental since its 2026-07-14 public launch — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true (env var, read automatically by the SDK) on every call or it 4xxs. Per-user filtering needs no headers: with a token from the Glean Authorization Server the caller's own credential is the permission boundary. Send no impersonation header; that belongs to a different architecture and does not apply here. The verifiable claim for this recipe is that an empty retrieval produces a refusal rather than a fabricated answer.

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

## Language

Ask me which language to build in before starting: Python, TypeScript.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Ask for something you personally don't have access to (another team's compensation review, an HR case file)"
  **Expected:** Retrieval returns nothing, so the app must say it has no information rather than answering from the model's own knowledge. This is the property that matters: your credential is the permission boundary, and an empty retrieval must produce a refusal, not a confident fabrication.
