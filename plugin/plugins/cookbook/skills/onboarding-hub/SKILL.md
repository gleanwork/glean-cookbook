---
name: onboarding-hub
description: "Alex Kim's day-one hub — checklist, progress, milestone badges, and contextual Glean chat — built two ways with the Web SDK and Platform Chat."
disable-model-invocation: true
---

Build "Onboarding Hub: gamified day-one onboarding for new hires" following https://developers.glean.com/cookbook/onboarding-hub

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
   Open the printed local URL. Confirm the checklist shows 5 done / 4 pending, click Ask about this on a step, and ask "What should Alex do on day one?" for a cited answer.

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
   Fill in GLEAN_API_TOKEN and GLEAN_INSTANCE. Set GLEAN_USE_FIXTURE=true for contract-only verification without a live handler.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   npm start
   ```

5. **Verify**
   Runs fixture-mode contract verification. For live verification against your instance, set GLEAN_USE_FIXTURE=false and ensure the experimental /api/chat handler is enabled.
   ```bash
   npm run verify:fixture
   ```

## Reference

Platform Chat (Path B): POST /api/chat, OpenAI Responses-style. Request: { input: string, stream?: boolean, store?: boolean }. Response: output[].content[].text + annotations[].sources[] (document/person/file/custom_entity). Experimental — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true and backend platform.apiMigratedEndpointsEnabled. Platform scope is CHAT_WRITE (registry uses cookbook-style CHAT). No scoping/inclusion filter fields in OpenAPI — soft-scope via corpus framing only. Until @gleanwork/api-client ships glean.chat.create, use fetch against /api/chat. Path A: Web SDK renderChat with SSO cookie; all ChatOptions fields optional. Do NOT teach Client API glean.client.chat.create or messageType === 'CONTENT' fragment parsing in this recipe.

## Authentication

This recipe needs `web-sdk-cookie` or `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## House style

This recipe renders a Web SDK UI — apply the cookbook's shared conventions (see the `cookbook-conventions` skill in this plugin): the real Acme logomark (not a plain colored square), a 480–500px-tall container, and `initialMessage` set to this recipe's own first demo query so it opens into a real answer instead of an empty landing screen.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance, with real credentials) and confirmed every query below produces its expected behavior. A build that runs without errors but fails one of these checks is not done — fix it and re-run before reporting success.

- **Query:** "What should Alex do on day one?"
  **Expected:** Answer lists Alex Kim's pending onboarding steps (security training, benefits enrollment, 1:1 with Priya, architecture walkthrough) with a citation to the onboarding checklist document.
- **Query:** "What onboarding steps do I still need to finish?"
  **Expected:** Same pending items as the day-one query, permission-aware to Alex's checklist.
- **Query:** "How do I set up VPN?"
  **Expected:** Cited answer from the VPN setup guide with real title and url.
- **Query:** "What's our PTO policy?"
  **Expected:** Cited answer from hr-pto-policy with real title and url.
