---
name: multi-step-agent
description: 'Build a Glean agent that plans, retrieves, and acts through a governed custom tool — with a safe fallback when the tool is denied.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `AGENTS`, `TOOLS`
- Agent builder access in your Glean instance
- Permission to register a custom tool (or admin help)
- A Glean token with AGENTS scope for API invocation
- uv and cloudflared installed locally
- Your own email, to put on (and take off) the tool server's allow-list between the two runs

Build "Multi-step agent with governed tools" following https://developers.glean.com/cookbook/multi-step-agent

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/multi-step-agent multi-step-agent
   ```

2. **Set the tool server's allow-list**
   Set AUTHORIZED_EMAILS to your own email for the first run. You'll remove it for the second run to see the denied branch — changing the allow-list is how both governance paths get demonstrated, since the agent always runs as you. The server refuses to start on an empty allow-list, since that denies everyone and makes the permitted branch unobservable.

   ```bash
   (cd multi-step-agent/tool-server && cp .env.example .env)
   ```

3. **Run the tool server**
   Listens on port 8080. Keep this running in its own terminal — the agent calls it over HTTP once registered.

   ```bash
   (cd multi-step-agent/tool-server && uv run server.py)
   ```

4. **Expose the demo tool over HTTPS**
   Keep this running in a second terminal. Copy the printed https://<random>.trycloudflare.com origin into tool-server/openapi.yaml as servers[0].url, with no path. Confirm that <origin>/file_incident_ticket returns the expected 403 for a denied email. This public demo route accepts a spoofable identity header and only creates fake in-memory tickets; authenticate requests from Glean before connecting a real write action.

   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

5. **Register the tool**
   Manual, UI-only step. After replacing the OpenAPI placeholder with the tunnel origin, use Admin > Platform > Tools > Add and upload multi-step-agent/tool-server/openapi.yaml. The operation URL must be <origin>/file_incident_ticket.

6. **Create the agent**
   Manual, UI-only step. In Agent Builder: paste the recipe's instructions, turn retrieval on, attach the tool you just registered. Copy the agent's ID for the next step.

7. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and GLEAN_AGENT_ID (the ID from the previous step).

   ```bash
   (cd multi-step-agent/invoke-agent && cp .env.example .env)
   ```

8. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   (cd multi-step-agent/invoke-agent && uv run main.py)
   ```

9. **Verify**
   With your email on the allow-list, confirm the ticket actually gets filed. Then restart the tool server without it and confirm the agent produces a read-only fallback summary instead of a hard failure.

## Reference

Run agents with glean.client.agents.run(agent_id, messages) using Message and MessageTextBlock. Expose a local demo tool through public HTTPS and set the OpenAPI server URL to that origin with route paths aligned. Register tools manually in the admin console. Glean-User-Email supports an authorization allow-list only after the request is authenticated as coming from Glean; the sample server is demo-only and must not front a real write action.

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

- **Query:** "Summarize our open incidents and file a tracking ticket"
  **Expected:** With your email on the tool server's allow-list: the agent summarizes and the demo tool call succeeds (200, a fake in-memory ticket id). With it removed: the tool returns 403 and the agent falls back to a read-only summary rather than failing the run. The allow-list demonstrates authorization logic; authenticate requests from Glean before connecting a real write action.
