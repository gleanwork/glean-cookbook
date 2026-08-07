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

Path A requires an explicit VITE_GLEAN_BACKEND, validated public/steps.json, and the user's existing Glean SSO session. Start Vite, report its exact URL, and wait for the user to open it in their normal signed-in browser; never open or automate it. Seed a step question by re-mounting with initialMessage. Do not pass chatId to continue a thread: it makes the widget treat that chat as selected and look for a message in its own frame URL instead of using initialMessage, so nothing is sent. Each ask starts a fresh thread; renderChat exposes no imperative send. Path B uses server-side Client Chat with saveChat:false, CONTENT messages, fragment citations, one empty-output retry, and an application-owned escalation state.

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

- **Query:** "What should I do on my first day?"
  **Expected:** Returns a cited answer drawn from your own onboarding documents, and the checklist reflects steps that actually appear in them rather than a hardcoded list.
- **Query:** "How do I set up VPN?"
  **Expected:** Returns a cited answer from your own IT documentation.
- **Query:** "What's our PTO policy?"
  **Expected:** Returns a cited answer respecting the asker's permissions — the same question from two people with different access should not return content either of them can't see.
- **Query:** "Ask about a step your docs don't cover"
  **Expected:** Client Chat path only: the app offers its escalation affordance rather than inventing a plausible-sounding onboarding step. The Web SDK owns its unsupported-answer experience.
