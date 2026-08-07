---
name: rfp-responder
description: 'Turn a customer questionnaire into grounded, cited draft answers — where every claim carries a source, unsupported rows route to a human, and nothing reaches the customer without approval.'
disable-model-invocation: true
---

Build "Answer an RFP or security questionnaire" following https://developers.glean.com/cookbook/rfp-responder

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/rfp-responder rfp-responder
   ```

2. **Install dependencies**

   ```bash
   cd rfp-responder && npm install
   ```

3. **Try it with no credentials**
   Runs the whole flow against recorded responses and asserts the failure contract: no ungrounded row carries an answer, every answered row carries a citation, and export is gated on approval.

   ```bash
   npm run verify:fixture
   ```

4. **Set credentials**
   Fill in GLEAN_SERVER_URL and your own GLEAN_API_TOKEN. The app runs as you; there is no act-as.

   ```bash
   cp .env.example .env
   ```

5. **Run it**

   ```bash
   npm start
   ```

6. **Verify**
   Load the questionnaire, confirm the column mapping, and draft. Check that a supported question (SOC 2, encryption at rest) returns a cited answer, and that an unsupported one (ISO 27001, RTO/RPO) is left blank and assigned to an SME rather than answered.

## Reference

Use Client Chat POST /rest/api/v1/chat with saveChat:false during verification. Read answer text from CONTENT messages and citations from fragment.citation.sourceDocument. Merge only exact duplicate questions. Classify citation topicality separately from approval for external use; every answer requires a citation, and unsupported rows remain blank with needs-sme status. Use the caller's credential as the permission boundary. Retry empty chat output and keep export behind explicit human approval with an audit log.

## Authentication

{{> auth-client-api}}

## Verify

{{> verify-gate}}

- **Query:** "Draft answers to a real questionnaire you've had to fill in"
  **Expected:** Every row is parsed across every tab, exact duplicates are merged, and each row is classified by the evidence behind it: strongly grounded rows get a cited draft, adjacent-evidence rows are flagged for verification, and rows with nothing behind them are left blank. Use a questionnaire your own content can actually speak to.
- **Query:** "Ask something your documentation genuinely doesn't cover"
  **Expected:** Retrieval finds nothing, so the row returns INSUFFICIENT_EVIDENCE and renders as 'needs SME' with no draft text, and accepting it is refused. This is the behaviour to check first — an RFP tool that invents a compliance answer is worse than no tool, because someone will send it to a customer.
- **Query:** "Ask something only tangentially covered"
  **Expected:** Retrieval finds a document that is genuinely on-topic but not authoritative, so the row is flagged weak rather than strong: drafted, but labelled as resting on documentation a person must clear before it goes out.
- **Query:** "Run the same questionnaire as a colleague with narrower access"
  **Expected:** Rows backed by documents that person cannot see collapse to 'needs SME' rather than being answered from elsewhere. Their own credential is the permission boundary — you are not impersonating them, you are each running the app as yourselves and comparing.
