---
name: incident-copilot
description: 'Triage an incident from your own runbooks and past incidents, propose one pre-registered action, and let a human approve it — where the gate refuses the wrong person, expiry escalates instead of auto-approving, and every attempt is audited.'
disable-model-invocation: true
---

Build "On-call copilot with a real approval gate" following https://developers.glean.com/cookbook/incident-copilot

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/incident-copilot incident-copilot
   ```

2. **Install dependencies**

   ```bash
   cd incident-copilot && npm install
   ```

3. **Watch the governance hold, with no credentials**
   Replays recorded responses and asserts the parts that matter: the gate refuses the wrong actor, expiry escalates without executing, an unregistered action is refused, a mutating action with no supported cause is downgraded, and every attempt is audited.

   ```bash
   npm run verify:fixture
   ```

4. **Set credentials**
   Fill in GLEAN_INSTANCE and your own GLEAN_API_TOKEN. Optionally set GLEAN_AGENT_ID for the agent-orchestrated path, and INCIDENT_ACTOR to change who the dashboard acts as.

   ```bash
   cp .env.example .env
   ```

5. **Run it**

   ```bash
   npm start
   ```

6. **Verify**
   Fire the sample alarm and check three things: the probable cause cites a past incident rather than a runbook, approving as someone who is not on call returns 403, and forcing expiry escalates without executing anything.

## Reference

Platform Search POST /api/search -> results[].{title,url,snippets}. Platform Chat POST /api/chat with { input, stream: false, store: true } -> output[].content[] where type === 'output_text', with .annotations[].sources[]. Platform Agents POST /api/agents/{agent_id}/runs with { messages: [{role:'USER',content:[{text,type:'text'}]}], stream: false } -> messages[].content[].text, synchronous, no polling. All require X-GLEAN-INCLUDE-EXPERIMENTAL: true and platform.apiMigratedEndpointsEnabled. Auth is the caller's own token; impersonation/act-as was removed from the cookbook recipes, so actions cannot execute as the approving user and the approval gate is an app-level policy check -- say so rather than implying per-person enforcement. Design findings worth carrying over: (1) relevance is not evidence -- classify documents by evidentiary role, because a runbook always outranks the precedent for alarm-shaped queries; (2) a mutating action requires an evidence-supported cause, or the same relevance-is-not-evidence mistake reappears in the action choice; (3) expiry must escalate rather than auto-approve; (4) authorization (who may approve) and authentication (proving who you are) are different problems and this recipe only implements the first. Service names, on-call identities and escalation targets all come from the reader's own catalog: an earlier draft named services from the sample catalog in examples/sample-catalog, which does still ship but is an opt-in Indexing SDK dataset that writes to your instance and must be seeded first -- no recipe may depend on it. The four negative cases -- unauthorized approver, expired window, unregistered action, no matching precedent -- are the recipe. A run where every path succeeds has not exercised the gate.

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

- **Query:** "Triage a real alert from one of your services"
  **Expected:** The copilot acknowledges in the channel, resolves the service to its on-call engineer and owner from your own service catalog, fans out retrieval, and posts a triage card. A past incident is cited as the precedent that supports whatever it proposes — the proposal has to point at evidence, not at a hunch.
- **Query:** "Triage an alert with no matching past incident"
  **Expected:** The highest-scoring retrieved document will often be a runbook, so a relevance-ranked copilot would confidently blame whatever that runbook is about. With no matching signature and nothing in flight, this copilot asserts no cause. Ranking is not evidence.
- **Query:** "Approve the proposed action as someone who is not on call"
  **Expected:** Refused with 403 and audited against that actor. The allowed set is the on-call engineer and service owner read from your service catalog, not a config file. The incident stays awaiting approval. The recipe implements the authorization itself — nothing upstream does it for you.
- **Query:** "Let the approval window expire"
  **Expected:** The proposal escalates to the escalation target named in your service catalog and is NOT executed. Auto-approving on timeout would invert the point of a gate. The escalation is audited and posted to the channel.
- **Query:** "Have the Glean agent propose an action that is not registered"
  **Expected:** Refused at proposal time and audited, with no approval card offered. An agent that can describe arbitrary actions into existence is an agent with production access, whatever its prompt says.
