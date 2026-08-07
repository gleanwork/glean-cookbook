---
name: onboarding-hub
description: 'A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.'
disable-model-invocation: true
---

Build "Onboarding Hub: a day-one checklist grounded in your own docs" following https://developers.glean.com/cookbook/onboarding-hub

1. **Pick a path**
   Path A (Web SDK) renders Glean's chat UI via renderChat — fastest for a portal page with SSO. Path B (Platform Chat) calls POST /api/chat from your backend — you own every pixel and parse OpenAI Responses-style output with citation annotations.

### Web SDK

Web SDK variant — checklist + renderChat

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/web-sdk onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Credentials**
   Default SSO auth needs no configuration — the Web SDK relies on the user's existing browser session with Glean.

4. **Run it**

   ```bash
   npm run dev
   ```

5. **Verify**
   Open the printed local URL (copy steps.example.json → steps.json). Confirm the checklist renders without a named-hire persona, click Ask about this on a step, and ask a first-day question for a cited answer.

### Platform Chat

Platform Chat variant — POST /api/chat, you own the UI

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/platform-chat onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN and GLEAN_SERVER_URL. Set GLEAN_ONBOARDING_STEPS_FILE or GLEAN_ONBOARDING_STEPS_JSON for your checklist. The app runs as you; there is no act-as.

   ```bash
   cp .env.example .env
   ```

4. **Run it**
   Leaves the server running so you can try it yourself at http://localhost:3000 — stop it (Ctrl-C) before the verify step below, which starts its own instance.

   ```bash
   npm start
   ```

5. **Verify**
   Loads credentials from .env (same as npm start), runs the demo queries against your own onboarding docs, and asserts cited answers for first-day / VPN / PTO plus escalation for an unsupported question. Do not report this recipe as done until this passes.
   ```bash
   npm run verify
   ```

## Reference

Platform Chat (Path B): POST /api/chat, OpenAI Responses-style. Request: { input: string, stream?: boolean, store?: boolean }. Response: output[].content[].text + annotations[].sources[] (document/person/file/custom_entity). Experimental — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true. Platform scope is CHAT_WRITE (registry uses cookbook-style CHAT). No scoping/inclusion filter fields in OpenAPI — soft-scope via corpus framing only. Until @gleanwork/api-client ships glean.chat.create, use fetch against /api/chat. Auth is the caller's own OAuth token or API token with CHAT scope -- impersonation/act-as was removed from the cookbook recipes, so the caller's credential is the permission boundary. Path A: Web SDK renderChat with SSO cookie; all ChatOptions fields optional, but backend should still be set explicitly — unset, the widget prompts for the user's email to route to an instance. renderChat returns a ChatHandle exposing only on/off, so there is no imperative way to send a message: injecting one means re-mounting, which starts a new thread unless ChatOptions.chatId is passed back. Capture it from chat:location_update (chat:id_update is deprecated; both can report undefined when a chat is cleared). Do NOT teach Client API glean.client.chat.create or messageType === 'CONTENT' fragment parsing in this recipe. The checklist and its steps must be derived from the reader's own onboarding content. An earlier draft seeded a named new hire's nine steps from a demo corpus that no longer exists, which made the hub display one fictional person's checklist on every instance. Ask rather than invent, and treat an empty or uncited answer as a state to render -- a new hire cannot distinguish an invented process from a real one. Use GLEAN_SERVER_URL rather than deriving the backend from an instance name.NOTE (2026-08-06): POST /api/chat is not available on the instances we test against (404), so the code calls POST /rest/api/v1/chat and parses messages[] entries where messageType is CONTENT. Platform Chat remains the intended contract.

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

Recipes demo Glean, so a demo app should look like Glean — and like the Cookbook page that
describes it. Don't hand-roll a palette or a component set.

**If you scaffolded a cookbook recipe** (`npx tiged …`), the shared stylesheet came with it. Link it
and compose from it:

```html
<link rel="stylesheet" href="/glean-cookbook.css" />
```

It provides design tokens, a base reset, grid/spacing utilities, and these primitives:

| Use for             | Classes                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Page shell          | `.layout` + `.layout-2col`, `.card`, `.subtitle`, `header`, `.mark`                                   |
| Full-height columns | `.layout-fill`, `.scroll-region` (each card scrolls its own content)                                  |
| Browser chrome      | `.frame`, `.frame-header`, `.frame-dot-{red,yellow,green}`, `.frame-url`, `.frame-body`               |
| Badges              | `.pill`, `.badge`, `.pill-selected`, `.pill-warning`, `.cat-{search,index,mcp,workflow,agent,portal}` |
| Callouts            | `.note`, `.note-info`, `.empty`                                                                       |
| Buttons             | `.btn-primary`, `.btn-secondary`, `.btn-link`, `.actions`, `.footer-links`                            |
| Results             | `.hit`, `.hit-title`, `.hit-meta`, `.citations`                                                       |
| Checklists          | `.step`, `.step-check`, `.step-actions`, `.step-due`                                                  |
| Chat transcript     | `.chat-row`, `.msg`, `.msg-user`, `.msg-assistant`, `.q`                                              |
| Web SDK container   | `.sdk-embed` (gives the widget a resolved height)                                                     |
| Metrics             | `.kpi-grid`, `.kpi`, `.kpi-value`, `.kpi-label`                                                       |

Add an inline `<style>` block only for something genuinely specific to this app, and use a token
(`var(--gdt-*)`, `var(--glean-border-radius-*)`, `var(--glean-shadow-*)`) rather than a literal value.
The primitives carry no copy — you choose the wording, the stylesheet only decides how it looks.

**If you're building from scratch** (no scaffold to copy), take the tokens from the same source rather
than inventing values — they're the developer site's:

```
https://raw.githubusercontent.com/gleanwork/glean-cookbook/main/styles/tokens.css
```

The accent is Glean Blue `#343ced`, hover `#131bd4`. Load Inter, or the page silently falls back to
system fonts and stops matching the docs.

Use the real Glean logomark, not a colored `<div>`/`<span>` or a recreated shape. Scaffolded recipes
already have it at `public/glean-logomark.svg`; otherwise inline this:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" role="img" aria-label="Glean">
  <title>Glean</title>
  <path d="M24.3006 2.95427L20.7656 0.199951L17.9028 3.99527C13.5653 1.93495 8.23019 3.08439 5.19394 7.00983C1.65888 11.5642 2.483 18.1138 7.03738 21.6489C8.77238 22.9935 10.7893 23.7092 12.8279 23.8177C16.1461 24.0128 19.5077 22.6248 21.6765 19.8055C24.7344 15.88 24.5175 10.4148 21.4596 6.72789L24.3006 2.95427ZM18.1197 17.0512C16.1028 19.632 12.3725 20.1091 9.77001 18.0922C7.18919 16.0752 6.71207 12.3233 8.72901 9.74246C9.70494 8.48458 11.1146 7.68214 12.6761 7.48696C13.0448 7.44358 13.4135 7.4219 13.7822 7.44358C14.975 7.50865 16.1244 7.94239 17.0787 8.67977C19.6595 10.7184 20.1366 14.4703 18.1197 17.0512Z" fill="#4718F2"/>
  <path d="M24.5176 21.6922C23.932 22.4513 23.2814 23.1236 22.5657 23.7525C21.8717 24.3381 21.1127 24.8803 20.3102 25.3357C19.5295 25.7695 18.6837 26.1382 17.8378 26.4201C16.992 26.702 16.1028 26.8972 15.2137 27.0057C14.3245 27.1141 13.4353 27.1575 12.5244 27.0924C11.6135 27.0273 10.7243 26.8755 9.85684 26.6587L9.66165 27.3743L8.77246 30.9962C9.90021 31.2998 11.0497 31.4733 12.2208 31.56C12.2642 31.56 12.3292 31.56 12.3726 31.56C13.5003 31.6251 14.6498 31.5817 15.7558 31.4516C16.927 31.2998 18.0981 31.0395 19.2258 30.6708C20.3536 30.3022 21.4597 29.825 22.5007 29.2395C23.5634 28.6539 24.561 27.9382 25.4935 27.1575C26.4478 26.355 27.3153 25.4442 28.0744 24.4465C28.1828 24.3164 28.2695 24.1646 28.378 24.0128L24.7779 21.3452C24.6694 21.4537 24.6044 21.5838 24.5176 21.6922Z" fill="#4718F2"/>
</svg>
```

If you'd rather the demo carry your own company's identity, swap in your logo and accent colour —
nothing about the recipe depends on these particular values.

**Web SDK components need none of this.** `renderChat`/`renderSearchBox`/`renderSearchResults` render
Glean's own UI, which already picks up whatever logo and colours your admin configured in Glean. Style
the surrounding page; give the container a resolved height with `.sdk-embed`; leave the embedded
component alone.

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

- **Query:** "What should I do on my first day?"
  **Expected:** Returns a cited answer drawn from your own onboarding documents, and the checklist reflects steps that actually appear in them rather than a hardcoded list.
- **Query:** "How do I set up VPN?"
  **Expected:** Returns a cited answer from your own IT documentation. This is the kind of question almost every company's onboarding content covers, so it works without seeding anything.
- **Query:** "What's our PTO policy?"
  **Expected:** Returns a cited answer respecting the asker's permissions — the same question from two people with different access should not return content either of them can't see.
- **Query:** "Ask about a step your docs don't cover"
  **Expected:** The hub says it has nothing on that and offers the escalation affordance, rather than inventing a plausible-sounding onboarding step.
