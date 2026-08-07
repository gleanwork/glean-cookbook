---
name: onboarding-hub
description: 'A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.'
disable-model-invocation: true
---

Build "Onboarding Hub: a day-one checklist grounded in your own docs" following https://developers.glean.com/cookbook/onboarding-hub

1. **Pick a path**
   Path A embeds Glean's chat UI with the Web SDK. Path B calls Client Chat from your backend and renders the response in your own UI.

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
   Open the printed local URL (copy steps.example.json → steps.json). Confirm the configured checklist renders, click Ask about this, and verify a cited first-day answer.

### Client Chat

Client Chat variant — server-side API call, custom UI

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

Path A uses Web SDK renderChat with SSO, an explicit backend, and chatId preservation when re-mounting with a new initialMessage. Path B uses server-side Client Chat POST /rest/api/v1/chat. Read CONTENT messages from GLEAN_AI and citations from fragment.citation.sourceDocument; keep the token server-side and set saveChat:false for verification. Build checklist steps from GLEAN_ONBOARDING_STEPS_JSON or GLEAN_ONBOARDING_STEPS_FILE. Retry empty chat output once; escalate only completed thin or uncited answers.

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
  **Expected:** Returns a cited answer from your own IT documentation.
- **Query:** "What's our PTO policy?"
  **Expected:** Returns a cited answer respecting the asker's permissions — the same question from two people with different access should not return content either of them can't see.
- **Query:** "Ask about a step your docs don't cover"
  **Expected:** The hub says it has nothing on that and offers the escalation affordance, rather than inventing a plausible-sounding onboarding step.
