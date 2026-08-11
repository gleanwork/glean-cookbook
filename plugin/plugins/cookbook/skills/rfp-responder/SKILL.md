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

{{> demo-mode}}

Ask these before running commands. Ask one at a time, waiting for each
answer before asking the next — do not put them all in one message:

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

4. **Set credentials**
   Only for a live run. Use the shipped login flow, then configure the approved source prefixes supplied up front. The app runs as the signed-in user; there is no act-as.

   ```bash
   cd rfp-responder && npm run login -- --email "<work-email>"
   ```

5. **Run it**

   ```bash
   cd rfp-responder && npm start
   ```

   Report [http://localhost:3000](http://localhost:3000) as a clickable link, using the exact printed URL if different.
   {{> run-local-web}}

6. **Verify**
   Load the questionnaire, confirm the column mapping, and draft. Check that a supported question (SOC 2, encryption at rest) returns a cited answer, and that an unsupported one (ISO 27001, RTO/RPO) is left blank and assigned to an SME rather than answered.
