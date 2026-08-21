---
name: rfp-responder
description: 'Turn a customer questionnaire into grounded, cited draft answers — where every claim carries a source, unsupported rows route to a human, and nothing reaches the customer without approval.'
disable-model-invocation: true
---

## Before you start

- Node 20 or newer
- Your work email, so the sign-in command can find your Glean tenant. If your tenant cannot use OAuth, you need a Glean API token with the CHAT scope instead
- Comma-separated Glean URL prefixes your security team has cleared for customer-facing answers. You put those in RFP_APPROVED_SOURCE_PREFIXES. Signing in does not fill this in
- A Glean instance with your company content indexed, and a questionnaire your own documents can speak to. You need these only for a live run

Build "Answer an RFP or security questionnaire" following https://developers.glean.com/cookbook/rfp-responder

{{> demo-mode}}

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- Which Glean URL prefixes may be quoted to a customer? Use the prefixes your security team has cleared for external answers.

{{> oauth-setup}}

1. **Copy the project onto your machine**
   Creates an rfp-responder folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/rfp-responder rfp-responder
   ```

2. **Install dependencies**
   Installs the small local server that serves the review page.

   ```bash
   cd rfp-responder && npm install
   ```

3. **See it work before you connect anything**
   Runs the whole flow against recorded Chat responses, so you can see the failure contract before you connect anything: no ungrounded row carries an answer, every answered row carries a citation, and export is gated on approval. This needs no Glean credentials.

   ```bash
   cd rfp-responder && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the CHAT scope.

   ```bash
   cd rfp-responder && npm run login -- --email "<work-email>"
   ```

5. **Choose which sources may be quoted to a customer**
   Signing in does not pick approved sources for you, so open .env and set RFP_APPROVED_SOURCE_PREFIXES to the comma-separated Glean URL prefixes your security team has cleared for customer-facing answers.

6. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.

   ```bash
   cd rfp-responder && npm start
   ```

   {{> run-local-web}}

7. **Check it against your own content**
   Load a questionnaire your own documents can speak to, confirm the column mapping, and draft. A row your docs cover should come back cited. A row they do not cover should stay blank and route to an SME.
