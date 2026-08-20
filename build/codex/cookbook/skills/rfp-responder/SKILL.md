---
name: rfp-responder
description: 'Turn a customer questionnaire into grounded, cited draft answers — where every claim carries a source, unsupported rows route to a human, and nothing reaches the customer without approval.'
disable-model-invocation: true
---

## Before you start

- For configured runs: a Glean instance with your company content indexed
- For configured runs: a work email for tenant discovery and OAuth sign-in; a CHAT-scoped API token is the fallback
- Node 20+

Build "Answer an RFP or security questionnaire" following https://developers.glean.com/cookbook/rfp-responder

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

- Which Glean URL prefixes are approved sources for external answers?
- What is your work email?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/rfp-responder rfp-responder
   ```

2. **Install dependencies**

   ```bash
   cd rfp-responder && npm install
   ```

3. **Try it with no credentials**
   Runs the whole flow against recorded responses and asserts the failure contract: no ungrounded row carries an answer, every answered row carries a citation, and export is gated on approval.

   ```bash
   cd rfp-responder && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the CHAT scope.

   ```bash
   cd rfp-responder && npm run login -- --email "<work-email>"
   ```

5. **Name the sources that may be quoted to a customer**
   Signing in does not pick approved evidence for you. Open .env and set RFP_APPROVED_SOURCE_PREFIXES to comma-separated Glean URL prefixes your security team has cleared for customer-facing answers.

6. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.

   ```bash
   cd rfp-responder && npm start
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.

7. **Check it against your own content**
   Load a questionnaire your own documents can speak to, confirm the column mapping, and draft. A row your docs cover should come back cited. A row they do not cover should stay blank and route to an SME.
