---
name: cookbook-conventions
description: Shared Acme Corp brand kit, Web SDK embed conventions, per-recipe auth-method guidance (web-sdk-cookie, client-api-oauth-or-token, indexing-token), and live-docs lookup for Glean cookbook recipes. Apply whenever building or styling a cookbook recipe that renders a UI (Acme Answers, embedded search/chat, the engineering portal, or a Lovable/Replit no-code build), whenever a recipe asks the user for a Glean instance/token/credential, or whenever a recipe's instructions reference a Glean API/SDK detail worth confirming.
---

# Cookbook house style

## Authentication: follow the recipe's declared `authMethod`

Every recipe's registry entry declares `authMethod` — which credential category it needs. That
declaration is the source of truth for which subsection below applies; don't re-derive it from
the recipe's prose, and don't apply a subsection the recipe didn't declare. A recipe can declare
more than one value when it offers a path choice (e.g. Acme Answers' Web SDK vs. Chat API paths)
— in that case, apply whichever subsection matches the path the user picks. Recipes declaring
`none` or `custom` don't use this section at all: `none` needs no Glean credential, and `custom`
means the recipe's own aiPrompt already fully specifies a bespoke credential step (a per-agent
bearer token from a Share dialog, the MCP Configurator's own OAuth flow, a token pasted into a
third-party tool's secret store) — follow that instead of inventing a detection chain it doesn't
need.

### `web-sdk-cookie`

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into `client-api-oauth-or-token` below — don't blend the two.

### `client-api-oauth-or-token`

Glean supports three ways to get a Client API credential. Try them in this order — don't assume
one over the others, since which are available depends on how the tenant is configured:

1. **Glean OAS (Glean's own OAuth Authorization Server)** — the most flexible, self-service
   option, and the one to try first. It's disabled by default per-tenant, so detect it rather
   than assume:
   - Ask for the user's work email — not a raw backend URL. Resolve their tenant with:
     ```
     POST https://app.glean.com/config/search
     Content-Type: application/json

     {"email": "<their email>"}
     ```
     Response: `{"search_config": {"queryURL": "https://{instance}.askscio.com/", ...}}`. Extract
     `{instance}` from the subdomain of `queryURL`. The real Client API backend is
     `https://{instance}-be.glean.com` — verified live for a `glean.com` email (resolves to
     `scio-prod-be.glean.com`) and for at least one real customer domain.
   - `GET {backend}/.well-known/oauth-authorization-server`. A 200 means Glean OAS is enabled for
     this tenant — use `authorization_code` + PKCE (verified live against
     `scio-prod-be.glean.com`: this is the grant Glean's own docs call "the recommended
     authentication method for Client API integrations," and what MCP hosts already use for
     their own sign-in flow). Do **not** use `client_credentials` even though it appears in
     `grant_types_supported` — a general client-credentials/service-account flow for the Client
     API is explicitly not yet a supported path for this kind of integration. A 404 (or any
     failure downstream — registration or token exchange rejected) means Glean OAS isn't enabled
     for this tenant; move to option 2.
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

### `indexing-token`

Indexing API operations accept Glean-issued tokens only — OAuth does not apply here regardless of
tenant configuration (per developers.glean.com/api-info/client/authentication/oauth). Don't run
the OAuth detection chain above for an indexing recipe; go straight to asking for a Glean
Indexing API token (`GLEAN_INDEXING_API_TOKEN`) and server URL (`GLEAN_SERVER_URL`), the same way
`index-custom-source` already does.

## Verify API details against live docs — mandatory, not a fallback

This plugin ships the `glean-developer-docs` MCP server (`docs_search`, `docs_fetch`) —
`developers.glean.com`'s own documentation, always current, including deprecation banners for any
field the OpenAPI spec marks `deprecated`. A recipe's `aiPrompt`/`llmContext` is a **dated cache**
of what a docs lookup returned at authoring time, not an independent source of truth — API
response shapes and field names drift, and this cookbook has already shipped a bug from exactly
that (a `citations[]` field that read as populated in hand-written prose but was actually
deprecated and empty at runtime).

Before writing or trusting **any** description of a Glean API response shape — not just when
something "seems" to disagree with what you already have, since a first-time read has nothing yet
to disagree with — run `docs_search`/`docs_fetch` for that endpoint and confirm the current shape,
including whether any field involved carries a deprecation notice. Recipe instructions exist to
describe _what_ to build and call out gotchas that aren't obvious from the docs (footguns in
bundled SDK examples, exact naming that's easy to get wrong); they are not a substitute for
checking the docs on anything shape-related.

Every cookbook recipe demo represents the same fictional company, Acme Corp. Use these exact
conventions instead of approximating — a plain colored square is not the logomark, and an
unsized chat container is not "embedded."

## Brand kit

Primary accent: `#0E8C84` (teal). Use this for the primary button, header accent, or active
state — not Glean's own blue.

Use the real logomark, not a colored `<div>`/`<span>`. For light backgrounds:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Acme Corp">
  <title>Acme Corp</title>
  <rect x="0" y="0" width="64" height="64" rx="18" fill="#0E8C84"></rect>
  <path fill-rule="evenodd" fill="#ffffff" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
</svg>
```

For dark backgrounds/dark mode:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Acme Corp">
  <title>Acme Corp</title>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.5" fill="#12B3A6" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"></rect>
  <path fill-rule="evenodd" fill="#0A1615" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
</svg>
```

Inline either `<svg>` directly, or save it as `logo.svg` and reference it — do not recreate the
mark from a text description. If you have filesystem/network access to the private
`gleanwork/glean-cookbook` repo, the canonical files are `brand/logomark-light.svg`,
`brand/logomark-dark.svg`, and `brand/tokens.json` (full color/type tokens); otherwise the SVGs
above are the complete, self-contained source.

## Web SDK embed sizing

`renderChat`/`renderSearchBox`/`renderSearchResults` need an explicit-sized container
(`position: relative`, `display: block`, a real `width`, a real `height`) or the widget won't
render at all. Beyond that minimum:

- **Height**: 480–500px reads as a properly-proportioned embedded panel. Taller containers
  (560px+) leave visible dead space below Glean's own chat landing view, which is a fixed-height
  hero, not something that stretches to fill its container.
- **First paint**: pass `initialMessage` (a `ChatOptions` field) with the recipe's own first demo
  query, e.g. `renderChat(el, { initialMessage: "What's our PTO policy?" })`. This opens straight
  into a real, cited answer instead of an empty "Ask Assistant anything" landing screen — a much
  better first impression, and it doubles as an on-load verification that the integration works.
