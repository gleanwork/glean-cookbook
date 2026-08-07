---
name: company-answers
description: 'The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `CHAT`
- A Glean instance with content indexed
- An OAuth access token or Glean API token with the CHAT scope
- For the Web SDK path: your tenant backend URL and an existing Glean session in your normal browser
- Node 20.19+ or 22.12+

Build "Company Answers: a cited Q&A page on your own content" following https://developers.glean.com/cookbook/company-answers

1. **Pick a path**
   Path A (Web SDK) renders Glean's own chat UI for you — fastest to stand up, no backend code. Path B (Chat API) calls the Chat API directly from your own backend — you own every pixel of the UI and the request/response shape. Both reach the same place: a permission-aware, cited answer.

### Web SDK

Web SDK variant — renderChat in a page

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/company-answers/web-sdk company-answers
   ```

2. **Install dependencies**

   ```bash
   cd company-answers && npm install
   ```

3. **Configure the tenant**
   Set VITE_GLEAN_BACKEND to the tenant's HTTPS backend origin. Optionally set VITE_GLEAN_INITIAL_MESSAGE to a question about content the user knows exists.

   ```bash
   cd company-answers && cp .env.example .env.local
   ```

4. **Run it**
   Keep Vite running, report its exact Local URL, and wait for the user to open it in their normal signed-in browser. Never open or automate the URL yourself.

   ```bash
   cd company-answers && npm run dev
   ```

5. **Verify**
   Give the user the exact printed local URL to open in their normal signed-in browser. Ask them to try a topic they know exists in their Glean instance and confirm a real, cited answer renders inside Glean's chat UI.

### Chat API

Chat API variant — one chat.create call, citations rendered

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/company-answers/chat-api company-answers
   ```

2. **Install dependencies**

   ```bash
   cd company-answers && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN and GLEAN_INSTANCE — the Authentication section below covers how to get a token.

   ```bash
   cd company-answers && cp .env.example .env
   ```

4. **Run it**
   Leaves the server running so you can try it yourself at http://localhost:3000 — stop it (Ctrl-C) before the deterministic verify step below, which starts its own instance.

   ```bash
   cd company-answers && npm start
   ```

5. **Verify**
   Starts the server and checks the example PTO queries for a non-empty answer with deduplicated citations. Run this when the instance contains PTO content; otherwise use the running app with a topic the user knows exists and check the same response shape.
   ```bash
   cd company-answers && npm run verify
   ```

## Reference

Path A uses renderChat with an explicit backend and the user's existing Glean browser session; live verification is user-mediated in their normal signed-in browser. Path B constructs Glean with apiToken plus instance or serverURL, reads answer text only from CONTENT messages, collects citations from fragment.citation.sourceDocument, deduplicates by URL, keeps the token server-side, sets saveChat:false for verification, and treats an empty joined answer as retryable.

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

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request time off?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
