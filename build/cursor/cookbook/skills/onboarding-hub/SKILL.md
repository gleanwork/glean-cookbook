---
name: onboarding-hub
description: 'A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `CHAT`
- A Glean instance with your onboarding content indexed
- For the Client Chat path: a token with the CHAT scope
- For the Web SDK path: your tenant backend URL and an existing Glean session in your normal browser
- Node 20.19+ or 22.12+

Build "Onboarding Hub: a day-one checklist grounded in your own docs" following https://developers.glean.com/cookbook/onboarding-hub

1. **Pick a path**
   Path A embeds Glean's chat UI with the Web SDK. Path B calls Client Chat from your backend and renders the response in your own UI.

### Web SDK

Web SDK variant — checklist + renderChat

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/web-sdk onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Configure the backend and checklist**
   Before running, set VITE_GLEAN_BACKEND in .env.local to the tenant's HTTPS backend origin and customize public/steps.json with the user's real onboarding steps. Keep every id unique. The included generic multi-step example is runnable but should be tailored.

   ```bash
   cd onboarding-hub && cp .env.example .env.local && cp public/steps.example.json public/steps.json
   ```

4. **Run it**
   Start Vite and leave it running. Report the exact Local URL printed by Vite. Never open the URL yourself and never use browser automation. Wait for the user to open it in their normal browser where they are already signed in to Glean and tell you it is ready.

   ```bash
   cd onboarding-hub && npm run dev
   ```

5. **Verify**
   After the user confirms the app is open in their normal signed-in browser, ask them to confirm the configured checklist renders. Have them click Ask about this and verify a cited first-day answer. Do not open or drive their browser.

### Client Chat

Client Chat variant — server-side API call, custom UI

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/platform-chat onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN and GLEAN_SERVER_URL. Customize the included steps.example.json, point GLEAN_ONBOARDING_STEPS_FILE at another file, or set GLEAN_ONBOARDING_STEPS_JSON. The app runs as the token owner; there is no act-as.

   ```bash
   cd onboarding-hub && cp .env.example .env
   ```

4. **Run it**
   Leaves the server running so you can try it yourself at http://localhost:3000 — stop it (Ctrl-C) before the verify step below, which starts its own instance.

   ```bash
   cd onboarding-hub && npm start
   ```

5. **Verify**
   Loads credentials from .env (same as npm start), runs the demo queries against your own onboarding docs, and asserts cited answers for first-day / VPN / PTO plus escalation for an unsupported question. Do not report this recipe as done until this passes.
   ```bash
   cd onboarding-hub && npm run verify
   ```

## Reference

Path A requires an explicit VITE_GLEAN_BACKEND, validated public/steps.json, and the user's existing Glean SSO session. Start Vite, report its exact URL, and wait for the user to open it in their normal signed-in browser; never open or automate it. Preserve chatId across re-mounts. Path B uses server-side Client Chat with saveChat:false, CONTENT messages, fragment citations, one empty-output retry, and an application-owned escalation state.

## Authentication

This recipe offers a path choice. Apply the block matching the path the user picks:

### `web-sdk-cookie`

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into the `client-api-oauth-or-token` flow — don't blend the two.

### `client-api-oauth-or-token`

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

## House style

This recipe renders a Web SDK UI. Apply the cookbook's shared conventions below.

For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.frame`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.chat-row`, `.msg`,
`.kpi`, and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use `public/glean-logomark.svg`; do not recreate the mark. For a build without scaffolded assets,
copy the tokens and mark from `https://github.com/gleanwork/glean-cookbook/tree/main/brand`.

Style only the surrounding page for Web SDK components. The embedded Glean UI supplies its own
branding. If the user wants their company's identity, replace the logo and accent consistently.

Give `renderChat`, `renderSearchBox`, and `renderSearchResults` a positioned container with explicit
width and height; 480–500px is a good default. When the experience should open directly into a cited
answer, ask the user for a topic they know exists in their Glean instance and pass that question as
`initialMessage`.

## Verify

If the selected path uses Web SDK cookie SSO, do not open the app in an agent-controlled browser,
incognito window, Playwright, or any other browser automation. Those browsers do not carry the
user's existing Glean session. Start the development server, keep it running, report the exact local
URL printed by the server, and ask the user to open that URL in their normal browser where they are
signed in to Glean. Wait for the user to report the result before claiming the live check passed.

Treat the queries below as acceptance scenarios, not as assumptions about what every Glean instance
contains. For a live check, ask the user for an equivalent topic they know exists in their instance
and confirm the same response properties: grounding, citations, permission filtering, and explicit
no-answer behavior where applicable. Use fixture or automated checks for corpus-independent
behavior. Do not claim a live check passed when the required content, credentials, user session, or
user confirmation was unavailable.

- **Query:** "What should I do on my first day?"
  **Expected:** Returns a cited answer drawn from your own onboarding documents, and the checklist reflects steps that actually appear in them rather than a hardcoded list.
- **Query:** "How do I set up VPN?"
  **Expected:** Returns a cited answer from your own IT documentation.
- **Query:** "What's our PTO policy?"
  **Expected:** Returns a cited answer respecting the asker's permissions — the same question from two people with different access should not return content either of them can't see.
- **Query:** "Ask about a step your docs don't cover"
  **Expected:** Client Chat path only: the app offers its escalation affordance rather than inventing a plausible-sounding onboarding step. The Web SDK owns its unsupported-answer experience.
