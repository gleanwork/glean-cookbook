---
name: onboarding-hub
description: 'A guided first-week hub for new hires: a checklist with progress, and every step able to answer itself from your own onboarding content.'
disable-model-invocation: true
---

## Before you start

- Node 20.19+ or 22.12+
- Your work email, so the setup command can find your Glean tenant. Path B only: if your tenant cannot use OAuth, you need a Glean API token with the CHAT scope instead
- Your own onboarding content, already indexed in Glean. The checklist and answers are built from that, not from a sample corpus
- Path A only: you are already signed in to Glean in your normal browser. This path uses that session and does not need an API token
- The first-week tasks you want on the checklist. Path A puts them in public/steps.json. Path B points GLEAN_ONBOARDING_STEPS_FILE at a JSON file of those tasks. The included example is enough to run the app

Build "Onboarding Hub: a day-one checklist grounded in your own docs" following https://developers.glean.com/cookbook/onboarding-hub

1. **Pick a path**
   Both paths build the same hub from your own onboarding docs, and each has its own set of steps. Choose Web SDK if you want Glean to own the chat UI, which is the faster start. Choose Client Chat if you want to own the answer, citations, and escalation yourself.

{{> choose-variant}}

### Web SDK

Web SDK variant — checklist + renderChat

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- Which of your first-week tasks should appear in the checklist? Use steps your onboarding docs actually cover.

{{> browser-cookie-setup}}

1. **Copy the project onto your machine**
   Creates an onboarding-hub folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/web-sdk onboarding-hub
   ```

2. **Install dependencies**
   Installs the Web SDK and the Vite app that serves the page.

   ```bash
   cd onboarding-hub && npm install
   ```

3. **Point the app at your Glean instance**
   Your email is used once to find which Glean tenant you belong to. The command creates .env.local and fills in VITE_GLEAN_BACKEND. If you skip this command, copy .env.example to .env.local and set VITE_GLEAN_BACKEND yourself to your Glean backend URL, for example https://acme-be.glean.com.

   ```bash
   cd onboarding-hub && npm run configure -- --email "<work-email>"
   ```

4. **Fill in your checklist**
   Pointing the app at Glean does not fill in the checklist, so copy public/steps.example.json to public/steps.json, then replace the sample steps with your own first-week tasks. Every id must be unique. The example file is enough to run the app.

   ```bash
   cd onboarding-hub && cp public/steps.example.json public/steps.json
   ```

5. **Open the page**
   Starts Vite and prints a Local URL. Open that URL in the same browser where you are already signed in to Glean.

   ```bash
   cd onboarding-hub && npm run dev
   ```

   {{> run-local-web-cookie}}

6. **Check it against your own content**
   Confirm your checklist shows the first-week tasks you set. Click Ask about this on a step and check that the answer cites one of your own onboarding documents.

### Client Chat

Client Chat variant — server-side API call, custom UI

{{> demo-mode}}

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- Which of your first-week tasks should appear in the checklist? Use steps your onboarding docs actually cover.

{{> oauth-setup}}

1. **Copy the project onto your machine**
   Creates an onboarding-hub folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/onboarding-hub/platform-chat onboarding-hub
   ```

2. **Install dependencies**
   Installs the small local server that serves the page.

   ```bash
   cd onboarding-hub && npm install
   ```

3. **See it work before you connect anything**
   Runs the checklist and Client Chat path against recorded Sample Corp responses, so you can see what it produces before you connect anything. This needs no Glean credentials. Cited first-day, VPN, and PTO answers stay cited; the unsupported question escalates.

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
   {{> run-local-web}}
