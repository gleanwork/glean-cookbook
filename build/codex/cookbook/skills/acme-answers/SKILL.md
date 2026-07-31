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
   Fill in GLEAN_API_TOKEN and GLEAN_INSTANCE — see the client-api-oauth-or-token auth section in cookbook-conventions for how to get a token.

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

This recipe needs `web-sdk-cookie` or `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## House style

This recipe renders a Web SDK UI — apply the cookbook's shared conventions (see the `cookbook-conventions` skill in this plugin): the real Acme logomark (not a plain colored square), a 480–500px-tall container, and `initialMessage` set to this recipe's own first demo query so it opens into a real answer instead of an empty landing screen.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance, with real credentials) and confirmed every query below produces its expected behavior. A build that runs without errors but fails one of these checks is not done — fix it and re-run before reporting success.

- **Query:** "What's our PTO policy?"
  **Expected:** Answer cites the PTO policy document (title + url), with a non-empty, deduped citations list — no leaked step-narration text prepended to the answer.
- **Query:** "Who owns the payments-service catalog entry?"
  **Expected:** Answer names the real owner from the seeded payments-service catalog entry and cites that document.
