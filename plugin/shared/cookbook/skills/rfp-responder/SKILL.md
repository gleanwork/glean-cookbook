---
name: rfp-responder
description: 'A review app that drafts cited answers to an RFP or security questionnaire, leaves unsupported questions blank, and requires a person to approve each answer. It starts with recorded Chat responses, so you can inspect its refusal paths before connecting it to Glean.'
disable-model-invocation: true
---

## Before you start

- Node 20 or newer
- Nothing else. The walkthrough replays recorded Chat responses, so it needs no credentials and makes no network calls
- Only for a live run: a Glean instance with company content indexed, a work email for sign-in or a Glean API token with the CHAT scope, and a reviewed list of document URL prefixes that may support customer-facing answers

Build "Answer an RFP or security questionnaire" following https://developers.glean.com/cookbook/rfp-responder

{{> demo-mode}}

1. **Copy the project onto your machine**
   Creates an rfp-responder folder containing the local server, review app, sample questionnaire, and recorded Chat responses. Stay in the same parent directory for the remaining commands.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/rfp-responder rfp-responder
   ```

2. **Install dependencies**
   Installs the packages for the TypeScript server. Everything runs on your machine, and nothing is deployed.

   ```bash
   cd rfp-responder && npm install
   ```

3. **See what it refuses before connecting anything**
   Replays the recorded responses through the full questionnaire and checks that every draft has a citation, unsupported rows stay blank, weak evidence is flagged, and export stays behind approval. The command needs no credentials and makes no network calls.

   ```bash
   cd rfp-responder && npm run verify:fixture
   ```

4. **Open the review app**
   Starts the local server and prints a Local URL. Open that URL in a browser. The app uses the same recorded responses, so there is nothing to sign in to.

   ```bash
   cd rfp-responder && npm start
   ```

   {{> run-local-web}}

5. **Load the sample and check the refusals**
   Click Try the bundled sample, then Confirm and draft answers. The app parses 20 rows and merges the exact SSO duplicate before drafting 19 questions. SEC-01 and SEC-02 get cited answers. ACC-02 and ACC-03 are marked weak. ACC-04 and CMP-01 stay blank and need a subject matter expert.
