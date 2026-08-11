---
name: onboarding-hub
description: 'A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.'
disable-model-invocation: true
---

## Before you start

- A Glean instance with your onboarding content indexed
- For the Web SDK path: an existing Glean session in your normal browser
- Node 20.19+ or 22.12+

Build "Onboarding Hub: a day-one checklist grounded in your own docs" following https://developers.glean.com/cookbook/onboarding-hub

1. **Pick a path**
   Path A embeds Glean's chat UI with the Web SDK. Path B calls Client Chat from your backend and renders the response in your own UI.

{{> choose-variant}}

### Web SDK

Web SDK variant — checklist + renderChat

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- What onboarding steps should appear in the checklist?

{{> browser-cookie-setup}}

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/web-sdk onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Configure the backend and checklist**
   Enter the user's work email when prompted; tenant discovery writes VITE_GLEAN_BACKEND to .env.local. Replace public/steps.json with the onboarding steps the user supplied and keep every id unique.

   ```bash
   cd onboarding-hub && npm run configure -- --email "<work-email>" && cp public/steps.example.json public/steps.json
   ```

4. **Run it**

   ```bash
   cd onboarding-hub && npm run dev
   ```

   {{> run-local-web-cookie}}

5. **Verify**
   After the user confirms the app is open in their normal signed-in browser, ask them to confirm the configured checklist renders. Have them click Ask about this and verify a cited first-day answer. Do not open or drive their browser.

### Client Chat

Client Chat variant — server-side API call, custom UI

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- What onboarding steps should appear in the checklist?

{{> oauth-setup}}

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/platform-chat onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Set credentials**
   The shipped command discovers the tenant and completes OAuth, with a CHAT-scoped API token fallback. Configure the supplied onboarding steps in ignored .env or a local steps file. The app runs as the signed-in user; there is no act-as.

   ```bash
   cd onboarding-hub && npm run login -- --email "<work-email>"
   ```

4. **Verify**
   Allow 1–3 minutes. It starts its own server and checks the configured onboarding topics for cited answers plus unsupported-question escalation.

   ```bash
   cd onboarding-hub && npm run verify
   ```

5. **Run it**
   ```bash
   cd onboarding-hub && npm start
   ```
   {{> run-local-web}}
