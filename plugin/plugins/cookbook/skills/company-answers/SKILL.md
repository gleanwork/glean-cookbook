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

{{> auth-web-sdk-cookie}}

### `client-api-oauth-or-token`

{{> auth-client-api}}

## House style

{{> web-sdk-house-style}}

{{> brand-kit}}

{{> web-sdk-sizing}}

## Verify

{{> verify-gate-web-sdk}}

{{> verify-gate}}

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request time off?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
