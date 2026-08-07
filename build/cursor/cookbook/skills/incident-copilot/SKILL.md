---
name: incident-copilot
description: 'Triage an incident from your own runbooks and past incidents, propose one pre-registered action, and let a human approve it — where the gate refuses the wrong person, expiry escalates instead of auto-approving, and every attempt is audited.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `SEARCH`, `CHAT`, `AGENTS`
- A Glean instance with engineering content indexed — a service catalog, runbooks, and at least one past incident review
- Your own OAuth access token or Glean API token with SEARCH and CHAT scopes (add AGENTS for the agent-orchestrated path)
- X_GLEAN_INCLUDE_EXPERIMENTAL=true (the Platform API is Experimental as of its 2026-07 launch)
- Node 20+

Build "On-call copilot with a real approval gate" following https://developers.glean.com/cookbook/incident-copilot

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/incident-copilot incident-copilot
   ```

2. **Install dependencies**

   ```bash
   cd incident-copilot && npm install
   ```

3. **Watch the governance hold, with no credentials**
   Replays recorded responses and asserts the parts that matter: the gate refuses the wrong actor, expiry escalates without executing, an unregistered action is refused, a mutating action with no supported cause is downgraded, and every attempt is audited.

   ```bash
   cd incident-copilot && npm run verify:fixture
   ```

4. **Set credentials**
   Fill in GLEAN_SERVER_URL and your own GLEAN_API_TOKEN. Optionally set GLEAN_AGENT_ID for the agent-orchestrated path, and INCIDENT_ACTOR to change who the dashboard acts as.

   ```bash
   cd incident-copilot && cp .env.example .env
   ```

5. **Run it**

   ```bash
   cd incident-copilot && npm start
   ```

6. **Verify**
   Fire the sample alarm and check three things: the probable cause cites a past incident rather than a runbook, approving as someone who is not on call returns 403, and forcing expiry escalates without executing anything.

## Reference

Use Platform Search for retrieval, Client Chat POST /rest/api/v1/chat for synthesis, and Platform Agents for the optional agent path. The app runs as the caller; its approval check is application policy, not impersonation. Resolve owners, on-call engineers, and escalation targets from the reader's service catalog. Only a matching past incident may support a cause; runbooks support procedures, not causes. Mutating actions require a supported cause, an authorized approver, a registered action, an unexpired proposal, and a complete audit trail. Set saveChat:false for verification and treat empty chat output as a retryable failure.

## Authentication

Use the first available credential path:

1. **Glean OAuth:** ask for the user's work email and run:
   ```bash
   node <plugin-root>/scripts/resolve-backend.mjs <work-email>
   ```
   If `oauthAvailable` is true, register a public client through the returned backend's Dynamic
   Client Registration endpoint and use authorization code + PKCE. Reuse the client id and refresh
   token.
2. **External IdP OAuth:** if Glean OAuth is unavailable, ask whether the user's administrator has
   configured Okta, Azure AD, Google, or another IdP for Glean Client API access. Use that sign-in
   flow when available.
3. **Glean API token:** otherwise request a token carrying the scopes declared by the recipe.

Do not use client credentials for an end-user Client API integration. Keep access and refresh tokens
server-side.

## Verify

Treat the queries below as acceptance scenarios, not as assumptions about what every Glean instance
contains. For a live check, ask the user for an equivalent topic they know exists in their instance
and confirm the same response properties: grounding, citations, permission filtering, and explicit
no-answer behavior where applicable. Use fixture or automated checks for corpus-independent
behavior. Do not claim a live check passed when the required content, credentials, user session, or
user confirmation was unavailable.

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
