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

   ```bash
   npm start
   ```

5. **Verify**
   Ask the demo queries against your own onboarding docs. Confirm cited answers for first-day / VPN / PTO, and that an unsupported question shows the escalation affordance instead of inventing a step.
   ```bash
   npm run verify
   ```

## Reference

Platform Chat (Path B): POST /api/chat, OpenAI Responses-style. Request: { input: string, stream?: boolean, store?: boolean }. Response: output[].content[].text + annotations[].sources[] (document/person/file/custom_entity). Experimental — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true and backend platform.apiMigratedEndpointsEnabled. Platform scope is CHAT_WRITE (registry uses cookbook-style CHAT). No scoping/inclusion filter fields in OpenAPI — soft-scope via corpus framing only. Until @gleanwork/api-client ships glean.chat.create, use fetch against /api/chat. Auth is the caller's own OAuth token or API token with CHAT scope -- impersonation/act-as was removed from the cookbook recipes, so the caller's credential is the permission boundary. Path A: Web SDK renderChat with SSO cookie; all ChatOptions fields optional, but backend should still be set explicitly — unset, the widget prompts for the user's email to route to an instance. renderChat returns a ChatHandle exposing only on/off, so there is no imperative way to send a message: injecting one means re-mounting, which starts a new thread unless ChatOptions.chatId is passed back. Capture it from chat:location_update (chat:id_update is deprecated; both can report undefined when a chat is cleared). Do NOT teach Client API glean.client.chat.create or messageType === 'CONTENT' fragment parsing in this recipe. The checklist and its steps must be derived from the reader's own onboarding content. An earlier draft seeded a named new hire's nine steps from a demo corpus that no longer exists, which made the hub display one fictional person's checklist on every instance. Ask rather than invent, and treat an empty or uncited answer as a state to render -- a new hire cannot distinguish an invented process from a real one. Use GLEAN_SERVER_URL rather than deriving the backend from an instance name.

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

- **Query:** "What should I do on my first day?"
  **Expected:** Returns a cited answer drawn from your own onboarding documents, and the checklist reflects steps that actually appear in them rather than a hardcoded list.
- **Query:** "How do I set up VPN?"
  **Expected:** Returns a cited answer from your own IT documentation. This is the kind of question almost every company's onboarding content covers, so it works without seeding anything.
- **Query:** "What's our PTO policy?"
  **Expected:** Returns a cited answer respecting the asker's permissions — the same question from two people with different access should not return content either of them can't see.
- **Query:** "Ask about a step your docs don't cover"
  **Expected:** The hub says it has nothing on that and offers the escalation affordance, rather than inventing a plausible-sounding onboarding step.
