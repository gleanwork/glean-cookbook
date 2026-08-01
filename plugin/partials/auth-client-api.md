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
