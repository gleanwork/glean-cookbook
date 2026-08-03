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
   Fill in GLEAN_INSTANCE and your own GLEAN_API_TOKEN. The app runs as you; there is no act-as.

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

Platform Chat: POST /api/chat with { input, stream: false, store: true }; parse output[].content[] where type === 'output_text' for .text and .annotations[].sources[] { title, url }. Requires X-GLEAN-INCLUDE-EXPERIMENTAL: true and platform.apiMigratedEndpointsEnabled. Auth is the caller's own OAuth token or API token with CHAT scope -- impersonation/act-as was removed from the cookbook recipes, so these apps are single-user and the caller's credential is the permission boundary. Two design findings worth carrying into similar builds: (1) lexical similarity cannot dedupe security questionnaires -- on the sample corpus the unsafe pair (at-rest vs in-transit encryption) scores 0.60 while the true duplicates score 0.29-0.30, so only exact matches can be merged automatically; (2) topicality and approval-for-external-use are independent -- an internal IT article can be the single most on-topic document for a question and still be unusable as customer-facing evidence, so approval must be declared rather than inferred from a relevance score. Nothing in this recipe may name a specific customer, questionnaire or document: an earlier draft named documents from the sample catalog in examples/sample-catalog, which does still ship but is an opt-in Indexing SDK dataset that writes to your instance and must be seeded first -- no recipe may depend on it, so naming its documents made the app appear to work while answering from content no reader has by default. The row classification is the recipe -- strongly grounded, adjacent, or nothing -- and it has to be computed from what the reader's own retrieval returns.

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
