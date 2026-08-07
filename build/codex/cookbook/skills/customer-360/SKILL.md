---
name: customer-360
description: 'One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.'
disable-model-invocation: true
---

Build "Customer 360: an account page built from your own content" following https://developers.glean.com/cookbook/customer-360

1. **Pick a path**
   Path A combines parallel Platform Search tiles with Client Chat synthesis. Path B keeps the same page UX but uses a template Account Brief agent.

### Platform Search Chat

Path A — parallel Platform Search tiles + Client Chat synthesis

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-search-chat customer-360
   ```

2. **Install dependencies**

   ```bash
   cd customer-360 && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_SERVER_URL, and GLEAN_ACCOUNT_NAME. The app runs as you; there is no act-as.

   ```bash
   cp .env.example .env
   ```

4. **Run it**
   Leaves the server running so you can try it yourself at http://localhost:3000 — stop it (Ctrl-C) before the verify step below, which starts its own instance.

   ```bash
   npm start
   ```

5. **Verify**
   Loads credentials from .env (same as npm start), runs the demo queries against the account you picked, and asserts cited answers with blank unsupported KPI fields. Do not report this recipe as done until this passes.
   ```bash
   npm run verify
   ```

### Platform Agents

Path B — Platform Agents createRun for prescriptive account briefs

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-agents customer-360
   ```

2. **Install dependencies**

   ```bash
   cd customer-360 && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_SERVER_URL, GLEAN_ACCOUNT_NAME, and GLEAN_AGENT_ID (Account Brief agent). The app runs as you; there is no act-as.

   ```bash
   cp .env.example .env
   ```

4. **Run it**
   Leaves the server running so you can try it yourself at http://localhost:3000 — stop it (Ctrl-C) before the verify step below, which starts its own instance.

   ```bash
   npm start
   ```

5. **Verify**
   Loads credentials from .env (same as npm start), runs the demo queries against your Account Brief agent, and asserts cited answers (or an explicit failure if the agent is missing or unauthorized). Do not report this recipe as done until this passes.
   ```bash
   npm run verify
   ```

## Reference

Use Platform Search for tiles, Client Chat POST /rest/api/v1/chat for synthesis, and Platform Agents for the optional agent path. Client Chat answers are CONTENT messages from GLEAN_AI; citations are fragment.citation.sourceDocument. Set saveChat:false for verification and keep tokens server-side. Read the account from GLEAN_ACCOUNT_NAME and leave owner, ARR, seats, renewal date, and risk blank unless retrieved documents support them. Use GLEAN_SERVER_URL directly.

## Authentication

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

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "What's the status of our renewal with that account?"
  **Expected:** Returns a non-empty answer citing real documents about the account you built the page around. Substitute the name when you ask — there is no fixed query text for a page built around whichever account you pick.
- **Query:** "Give me a customer summary"
  **Expected:** Synthesizes across more than one source with a citation per claim, rather than restating a single document.
- **Query:** "What are the renewal risks?"
  **Expected:** Either names risks grounded in cited content, or says it has none to report. It must not infer risk the sources don't support, and the KPI header must leave unsupported fields blank rather than showing a figure no document contains.
