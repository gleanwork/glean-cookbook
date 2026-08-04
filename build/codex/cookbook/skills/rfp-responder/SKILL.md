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

Platform Chat: POST /api/chat with { input, stream: false, store: true }; parse output[].content[] where type === 'output_text' for .text and .annotations[].sources[] { title, url }. Requires X-GLEAN-INCLUDE-EXPERIMENTAL: true and platform.apiMigratedEndpointsEnabled. Auth is the caller's own OAuth token or API token with CHAT scope -- impersonation/act-as was removed from the cookbook recipes, so these apps are single-user and the caller's credential is the permission boundary. Two design findings worth carrying into similar builds: (1) lexical similarity cannot dedupe security questionnaires -- on the sample corpus the unsafe pair (at-rest vs in-transit encryption) scores 0.60 while the true duplicates score 0.29-0.30, so only exact matches can be merged automatically; (2) topicality and approval-for-external-use are independent -- an internal IT article can be the single most on-topic document for a question and still be unusable as customer-facing evidence, so approval must be declared rather than inferred from a relevance score. Nothing in this recipe may name a specific customer, questionnaire or document: an earlier draft named documents from the sample catalog in examples/sample-catalog, which does still ship but is an opt-in Indexing SDK dataset that writes to your instance and must be seeded first -- no recipe may depend on it, so naming its documents made the app appear to work while answering from content no reader has by default. The row classification is the recipe -- strongly grounded, adjacent, or nothing -- and it has to be computed from what the reader's own retrieval returns. /api/chat can return HTTP 200 for a run that never finished: an empty CONTENT message, a trailing SERVER_TOOL, and no error field anywhere, for roughly one call in four on questions that invoke a server tool. Treat a response with no text block as a retryable transport failure, not as a finding. It is not the same as a refusal, and it must never be reported to the user as absent or insufficient evidence -- that is a claim about their corpus which a call that never completed cannot support.

## Authentication

Glean supports three ways to get a Client API credential. Try them in this order — don't assume
one over the others, since which are available depends on how the tenant is configured:

1. **Glean OAS (Glean's own OAuth Authorization Server)** — the most flexible, self-service
   option, and the one to try first. It's disabled by default per-tenant, so detect it rather
   than assume:
   - Ask for the user's work email — not a raw backend URL. Resolve their tenant and check OAuth
     availability with `resolve-backend.mjs`, bundled alongside this plugin's skills (a sibling of
     the `skills/` directory, under `scripts/`) — locate it and run it, don't hand-derive the
     `config/search` call or the `.well-known/oauth-authorization-server` check from memory, since
     getting either wrong silently resolves to the wrong tenant or the wrong auth path. Its
     invocation is:
     ```bash
     node <path-to-this-plugin>/scripts/resolve-backend.mjs <their work email>
     ```
     Prints `{"instance", "backend", "oauthAvailable"}` — `backend` is the real Client API
     backend (verified live for a `glean.com` email, resolves to `scio-prod-be.glean.com`, and for
     at least one real customer domain), and `oauthAvailable` tells you whether to continue with
     Glean OAS below or fall back to option 2.
   - If `oauthAvailable` is `true` — use `authorization_code` + PKCE (verified live against
     `scio-prod-be.glean.com`: this is the grant Glean's own docs call "the recommended
     authentication method for Client API integrations," and what MCP hosts already use for
     their own sign-in flow). Do **not** use `client_credentials` even though it appears in
     `grant_types_supported` — a general client-credentials/service-account flow for the Client
     API is explicitly not yet a supported path for this kind of integration. If registration or
     the token exchange itself fails downstream, that also means Glean OAS isn't usable for this
     tenant; move to option 2.
   - Get a `client_id` via **Dynamic Client Registration** — the metadata's
     `registration_endpoint` (verified live: `POST {backend}/oauth/register` with `client_name`,
     `redirect_uris`, `grant_types: ["authorization_code", "refresh_token"]`,
     `response_types: ["code"]`, `token_endpoint_auth_method: "none"` returns `201` with a real
     `client_id`, no admin pre-approval needed). This is the same mechanism real MCP hosts
     already use to connect to Glean — self-service, not something that requires the end user or
     their IT admin to pre-register a Static OAuth Client first. Register once per app, reuse the
     `client_id` for every subsequent login from that app.
   - Complete the `authorization_code` + PKCE exchange with that `client_id` — a real browser
     login (the user signs in via their normal SSO), then exchange the returned code at
     `{backend}/oauth/token` for an access token + `refresh_token`. Use the refresh token to
     avoid repeating the interactive login on every run.
2. **IdP OAuth** — the customer's own identity provider (Okta, Azure AD, Google, etc.) issues the
   token instead of Glean's own authorization server. This is admin-configured on the customer's
   side, not something discoverable or self-service the way Glean OAS is — if Glean OAS isn't
   enabled, ask the user whether their Glean admin has set up OAuth with an external IdP, and if
   so get an access token via that IdP-integrated sign-in flow rather than guessing at one.
3. **Glean Token** — least preferred, most cumbersome: the user needs either an admin to grant
   them a token, or the API Token Creator role themselves. Fall back to this only after ruling out
   both OAuth options above, by asking for an API token with the scope the recipe needs.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "Draft answers to a real questionnaire you've had to fill in"
  **Expected:** Every row is parsed across every tab, exact duplicates are merged, and each row is classified by the evidence behind it: strongly grounded rows get a cited draft, adjacent-evidence rows are flagged for verification, and rows with nothing behind them are left blank. Use a questionnaire your own content can actually speak to.
- **Query:** "Ask something your documentation genuinely doesn't cover"
  **Expected:** Retrieval finds nothing, so the row returns INSUFFICIENT_EVIDENCE and renders as 'needs SME' with no draft text, and accepting it is refused. This is the behaviour to check first — an RFP tool that invents a compliance answer is worse than no tool, because someone will send it to a customer.
- **Query:** "Ask something only tangentially covered"
  **Expected:** Retrieval finds a document that is genuinely on-topic but not authoritative, so the row is flagged weak rather than strong: drafted, but labelled as resting on documentation a person must clear before it goes out.
- **Query:** "Run the same questionnaire as a colleague with narrower access"
  **Expected:** Rows backed by documents that person cannot see collapse to 'needs SME' rather than being answered from elsewhere. Their own credential is the permission boundary — you are not impersonating them, you are each running the app as yourselves and comparing.
