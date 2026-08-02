---
name: embed-search-chat
description: 'Put permission-aware Glean search and chat directly inside an internal app with the Web SDK, so your team gets answers where they already work.'
disable-model-invocation: true
---

Embed Glean search and chat in my internal web app using the Glean Web
SDK, following the recipe at
https://developers.glean.com/cookbook/embed-search-chat

Steps:

1. Ask me for my Glean backend URL (https://{instance}-be.glean.com).
2. Install the SDK: npm install @gleanwork/web-sdk. (If the app has no
   build toolchain, fall back to the script tag from my Glean app domain:
   <script defer src="https://{GLEAN_APP_DOMAIN}/embedded-search-latest.min.js"></script>
   — the same methods appear on window.GleanWebSDK.)
3. Add a search box and results container, then:
   import { renderSearchBox, renderSearchResults } from "@gleanwork/web-sdk";
   renderSearchBox(searchBoxElement, { backend, onSearch: (query) =>
   renderSearchResults(resultsElement, { query }) });
4. Add a chat container: position: relative, display: block, width: 100%,
   height: 480px — any shorter and long answers scroll awkwardly, any
   taller and you get dead space below Glean's own chat landing view. Then:
   import { renderChat } from "@gleanwork/web-sdk";
   renderChat(containerElement, { backend, initialMessage: "What's our PTO policy?" });
   initialMessage opens straight into a real cited answer instead of an
   empty landing screen, and doubles as your on-load verification.
5. Default SSO auth needs no extra configuration. If I ask for
   server-to-server auth instead, follow
   https://developers.glean.com/libraries/web-sdk/authentication/server-to-server
   and keep the API key strictly server-side.

See Verify below for what a correct build must do.

## Setup

- Scaffold web SDK embed

## Reference

Embeds Glean search and chat into an existing web app via the Glean Web SDK npm package @gleanwork/web-sdk (renderSearchBox, renderSearchResults, renderChat named exports; script-tag fallback exposes the same methods on window.GleanWebSDK). Pass the backend option to route users directly to the instance. Auth is Glean SSO by default or server-to-server tokens minted by a backend holding an admin API key with SEARCH and CHAT scopes. All results are permission-aware per user.

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

## Language

Ask me which language to build in before starting: TypeScript, JavaScript.

## House style

This recipe renders a Web SDK UI. Apply the cookbook's shared conventions below.

Primary accent: `#343ced` (Glean Blue), hover `#131bd4`. These recipes demo Glean, so a demo
app should look like Glean rather than like an unrelated third party.

Use the real Glean logomark, not a colored `<div>`/`<span>` or a recreated shape:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Glean">
  <title>Glean</title>
  <path d="M24.3006 2.95427L20.7656 0.199951L17.9028 3.99527C13.5653 1.93495 8.23019 3.08439 5.19394 7.00983C1.65888 11.5642 2.483 18.1138 7.03738 21.6489C8.77238 22.9935 10.7893 23.7092 12.8279 23.8177C16.1461 24.0128 19.5077 22.6248 21.6765 19.8055C24.7344 15.88 24.5175 10.4148 21.4596 6.72789L24.3006 2.95427ZM18.1197 17.0512C16.1028 19.632 12.3725 20.1091 9.77001 18.0922C7.18919 16.0752 6.71207 12.3233 8.72901 9.74246C9.70494 8.48458 11.1146 7.68214 12.6761 7.48696C13.0448 7.44358 13.4135 7.4219 13.7822 7.44358C14.975 7.50865 16.1244 7.94239 17.0787 8.67977C19.6595 10.7184 20.1366 14.4703 18.1197 17.0512Z" fill="#4718F2"/>
  <path d="M24.5176 21.6922C23.932 22.4513 23.2814 23.1236 22.5657 23.7525C21.8717 24.3381 21.1127 24.8803 20.3102 25.3357C19.5295 25.7695 18.6837 26.1382 17.8378 26.4201C16.992 26.702 16.1028 26.8972 15.2137 27.0057C14.3245 27.1141 13.4353 27.1575 12.5244 27.0924C11.6135 27.0273 10.7243 26.8755 9.85684 26.6587L9.66165 27.3743L8.77246 30.9962C9.90021 31.2998 11.0497 31.4733 12.2208 31.56C12.2642 31.56 12.3292 31.56 12.3726 31.56C13.5003 31.6251 14.6498 31.5817 15.7558 31.4516C16.927 31.2998 18.0981 31.0395 19.2258 30.6708C20.3536 30.3022 21.4597 29.825 22.5007 29.2395C23.5634 28.6539 24.561 27.9382 25.4935 27.1575C26.4478 26.355 27.3153 25.4442 28.0744 24.4465C28.1828 24.3164 28.2695 24.1646 28.378 24.0128L24.7779 21.3452C24.6694 21.4537 24.6044 21.5838 24.5176 21.6922Z" fill="#4718F2"/>
</svg>
```

Inline the `<svg>` directly, or save it as `logo.svg` and reference it — don't recreate the mark
from a text description. The canonical copy is `brand/glean-logomark.svg` in the
`gleanwork/glean-cookbook` repo, with full colour and type tokens in `brand/tokens.json`; the SVG
above is a complete, self-contained substitute.

If you'd rather the demo carry your own company's identity, swap in your logo and accent colour —
nothing about the recipe depends on these particular values.

**Web SDK components need none of this.** `renderChat`/`renderSearchBox`/`renderSearchResults`
render Glean's own UI, which already picks up whatever logo and colours your admin configured in
Glean. Style the surrounding page; leave the embedded component alone.

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
- **Query:** "Who should I ask about billing?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Summarize our latest product update"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
