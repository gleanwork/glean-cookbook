---
name: onboarding-hub
description: 'A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.'
disable-model-invocation: true
---

## Before you start

- Node 20.19 or 22.12+
- Your work email, so setup can find your Glean tenant
- Onboarding content already indexed in Glean, because the checklist answers from your own docs
- Web SDK path only: you are already signed in to Glean in your normal browser

Build "Onboarding Hub: a day-one checklist grounded in your own docs" following https://developers.glean.com/cookbook/onboarding-hub

1. **Pick a path**
   Both paths build the same first-week checklist. Choose Web SDK if you want Glean's chat UI and the Glean session already in your browser. Choose Client Chat if you want to own the answer UI and call Glean from your backend.

Ask which variant to build first, on its own, and wait for the answer. Then follow only that variant
below, asking its questions one at a time.

### Web SDK

Web SDK variant — checklist + renderChat

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What onboarding steps should appear in the checklist? Use the names your own onboarding docs use.

Cookie SSO requires the user's normal signed-in browser. Never open or automate the app yourself.

1. **Copy the project onto your machine**
   Creates an onboarding-hub folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/web-sdk onboarding-hub
   ```

2. **Install dependencies**
   Installs the Glean Web SDK and the Vite dev server that hosts the page.

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Find your Glean tenant**
   Your email is used once to find which Glean tenant you belong to. The command creates .env.local and fills in VITE_GLEAN_BACKEND.

   ```bash
   cd onboarding-hub && npm run configure -- --email "<work-email>"
   ```

4. **Put your onboarding steps in the checklist**
   Finding your tenant does not pick a checklist for you, so open public/steps.json and replace the sample steps with your own. Each step needs a unique id, a title, a group (it, hr, team, or engineering), initiallyDone, and an askPrompt.

5. **Open the page**
   Starts Vite and prints a Local URL. Open that URL yourself in your normal browser where you are already signed in to Glean.

   ```bash
   cd onboarding-hub && npm run dev
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Do not open or automate the link. Ask the user to click it in their normal browser where they
   are already signed in to Glean and confirm the page is ready. Then give the first verification
   action.

6. **Check it against your own content**
   Once the page is open in your signed-in browser, confirm your checklist renders. Click Ask about this on a step and check that Glean returns a cited first-day answer.

### Client Chat

Client Chat variant — server-side API call, custom UI

### Select the run mode

Before asking setup questions, silently check whether `GLEAN_COOKBOOK_DEMO` is exactly `true`; do
not print the environment or the variable value.

- When it is `true`, use the bundled sample-data path: skip all setup questions, authentication,
  and fixture verification output; after scaffolding and installing, run `npm run demo` and follow
  the standard browser handoff.
- Otherwise, never mention or offer demo, sample, or fixture mode. Skip the fixture-only step and
  follow the normal configured run, including its setup questions, authentication, and live
  verification.

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What onboarding steps should appear in the checklist? Use the names your own onboarding docs use.

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Copy the project onto your machine**
   Creates an onboarding-hub folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/platform-chat onboarding-hub
   ```

2. **Install dependencies**
   Installs the Glean API client and the small local server that serves the page.

   ```bash
   cd onboarding-hub && npm install
   ```

3. **See it work before you connect anything**
   Runs the checklist and chat against recorded Sample Corp answers, so you can see cited first-day, VPN, and PTO replies plus unsupported-question escalation before you connect anything. This needs no Glean credentials.

   ```bash
   cd onboarding-hub && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the CHAT scope.

   ```bash
   cd onboarding-hub && npm run login -- --email "<work-email>"
   ```

5. **Put your onboarding steps in the checklist**
   Signing in does not pick a checklist for you. steps.json is already selected in .env, so open that file and replace the sample steps with your own. Each step needs a unique id, a title, a group (it, hr, team, or engineering), initiallyDone, and an askPrompt.

6. **Check it against your own content**
   Takes 1 to 3 minutes. It starts its own server, checks your onboarding topics for cited answers, and fails if an unsupported question does not escalate.

   ```bash
   cd onboarding-hub && npm run verify
   ```

7. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.
   ```bash
   cd onboarding-hub && npm start
   ```
   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.
