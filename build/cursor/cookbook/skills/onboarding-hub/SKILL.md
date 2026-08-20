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

Ask which variant to build first, on its own, and wait for the answer. Then follow only that variant
below, asking its questions one at a time.

### Web SDK

Web SDK variant — checklist + renderChat

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What onboarding steps should appear in the checklist?

Cookie SSO requires the user's normal signed-in browser. Never open or automate the app yourself.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/web-sdk onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Point the app at your Glean instance**
   Your email is used once to find which Glean tenant you belong to. The command creates .env.local and fills in VITE_GLEAN_BACKEND. If you would rather skip it, copy .env.example to .env.local and set VITE_GLEAN_BACKEND to the Glean web app URL from the About page, for example https://acme.glean.com.

   ```bash
   cd onboarding-hub && npm run configure -- --email "<work-email>"
   ```

4. **Fill in your checklist**
   Copying the example gives you a runnable file. Open public/steps.json and replace the sample steps with your own first-week tasks. Every id must be unique.

   ```bash
   cd onboarding-hub && cp public/steps.example.json public/steps.json
   ```

5. **Open the page**
   Starts Vite and prints a Local URL. Open that URL in the same browser where you are already signed in to Glean.

   ```bash
   cd onboarding-hub && npm run dev
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Do not open or automate the link. Ask the user to click it in their normal browser where they
   are already signed in to Glean and confirm the page is ready. Then give the first verification
   action.

6. **Check it against your own content**
   Confirm your checklist renders. Click Ask about this on a first-week step and check that the answer cites one of your documents.

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
- What onboarding steps should appear in the checklist?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/platform-chat onboarding-hub
   ```

2. **Install dependencies**

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Try it with no credentials**
   Runs the checklist and Client Chat path against recorded Sample Corp responses. Cited first-day, VPN, and PTO answers must stay cited; the unsupported question must escalate.

   ```bash
   cd onboarding-hub && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the CHAT scope.

   ```bash
   cd onboarding-hub && npm run login -- --email "<work-email>"
   ```

5. **Point the app at your onboarding steps**
   Signing in does not pick a checklist for you. Open .env and keep GLEAN_ONBOARDING_STEPS_FILE pointed at a JSON file of your first-week tasks. The included ./steps.example.json is enough to run the app. Edit that file, or point the variable at one of your own.

6. **Check it against your own content**
   Takes 1 to 3 minutes. It starts its own server, asks your Glean instance about the steps in that file, and fails if a supported question comes back without a citation or if an unsupported question does not escalate.

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
