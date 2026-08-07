---
name: company-answers
description: 'The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.'
disable-model-invocation: true
---

Build "Company Answers: a cited Q&A page on your own content" following https://developers.glean.com/cookbook/company-answers

1. **Pick a path**
   Path A (Web SDK) renders Glean's own chat UI for you — fastest to stand up, no backend code. Path B (Chat API) calls the Chat API directly from your own backend — you own every pixel of the UI and the request/response shape. Both reach the same place: a permission-aware, cited answer.

### Web SDK

Web SDK variant — renderChat in a page

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/company-answers/web-sdk company-answers
   ```

2. **Install dependencies**

   ```bash
   cd company-answers && npm install
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
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/company-answers/chat-api company-answers
   ```

2. **Install dependencies**

   ```bash
   cd company-answers && npm install
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

Client Chat uses POST /rest/api/v1/chat through glean.client.chat.create. Construct Glean with apiToken plus instance or serverURL. Read answer text only from CONTENT messages, collect citations from fragment.citation.sourceDocument, and deduplicate by URL. Keep the token server-side, set saveChat:false for verification, and treat an empty joined answer as a retryable failure.

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

{{> verify-gate}}

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request time off?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
