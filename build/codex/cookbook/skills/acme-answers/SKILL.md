---
name: acme-answers
description: 'The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.'
disable-model-invocation: true
---

Build "Acme Answers: a company knowledge Q&A page" following https://developers.glean.com/cookbook/acme-answers

1. **Pick a path**
   Path A (Web SDK) renders Glean's own chat UI for you — fastest to stand up, no backend code. Path B (Chat API) calls the Chat API directly from your own backend — you own every pixel of the UI and the request/response shape. Both reach the same place: a permission-aware, cited answer.

### Web SDK

Web SDK variant — renderChat in a page

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/acme-answers/web-sdk acme-answers
   ```

2. **Install dependencies**

   ```bash
   cd acme-answers && npm install
   ```

3. **Credentials**
   Default SSO auth needs no configuration — the Web SDK relies on the user's existing browser session with Glean.

4. **Run it**

   ```bash
   npm run dev
   ```

5. **Verify**
   Open the printed local URL and ask "What's our PTO policy?" — confirm a real, cited answer renders inside Glean's chat UI.

### Chat API

Chat API variant — one chat.create call, citations rendered

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/acme-answers/chat-api acme-answers
   ```

2. **Install dependencies**

   ```bash
   cd acme-answers && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN and GLEAN_INSTANCE — the Authentication section below covers how to get a token.

   ```bash
   cp .env.example .env
   ```

4. **Run it**
   Leaves the server running so you can try it yourself at http://localhost:3000 — stop it (Ctrl-C) before the deterministic verify step below, which starts its own instance.

   ```bash
   npm start
   ```

5. **Verify**
   Starts the server itself, runs both demo queries for real, and asserts the response shape (non-empty answer, non-empty deduped citations with title+url) — exits non-zero on any failure. Do not report this recipe as done until this passes.
   ```bash
   npm run verify
   ```

## Reference

Chat API: POST /rest/api/v1/chat (client SDK glean.client.chat.create). A real response can include earlier UPDATE-type messages narrating search/read steps ahead of the answer — filter to messageType === 'CONTENT' before joining fragments[].text, or that narration text ends up prepended to the answer. Citations live per-fragment at fragments[].citation.sourceDocument (title, url), not a top-level citedDocuments field and not the older message.citations[] field — that field is deprecated (removal scheduled 2026-10-15) and, verified live, wasn't populated at all on an agentic chat response even though real citations existed. Dedupe citations by url since the same source is commonly cited by more than one fragment. Client constructor takes apiToken + instance (or serverURL), not domain.

## Authentication

This recipe offers a path choice. Apply the block matching the path the user picks:

### `web-sdk-cookie`

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into the `client-api-oauth-or-token` flow — don't blend the two.

### `client-api-oauth-or-token`

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

## House style

This recipe renders a Web SDK UI. Apply the cookbook's shared conventions below.

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

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request time off?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
