---
name: multi-step-agent
description: 'Build a Glean agent that plans, retrieves, and acts through a governed custom tool — with a safe fallback when the tool is denied.'
disable-model-invocation: true
---

## Before you start

- Agent builder access in your Glean instance
- Permission to register a custom tool (or admin help)
- A work email for tenant discovery and OAuth sign-in; an AGENTS-scoped API token is the fallback
- uv and cloudflared installed locally
- Your own email, to put on (and take off) the tool server's allow-list between the two runs

Build "Multi-step agent with governed tools" following https://developers.glean.com/cookbook/multi-step-agent

{{> ask-setup-questions}}

- What is your work email for tenant discovery and the tool allow-list?
- After creating the agent, what is its agent ID?

{{> oauth-setup}}

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

   {{> run-hybrid-service}}

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
   Use the shipped login flow, then set GLEAN_AGENT_ID from the agent created above. Never implement authentication.

   ```bash
   (cd multi-step-agent/invoke-agent && node scripts/glean-auth.mjs login --scopes agents --email "<work-email>")
   ```

8. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   (cd multi-step-agent/invoke-agent && uv run main.py)
   ```

   {{> run-hybrid-service}}

9. **Verify**
   With your email on the allow-list, confirm the ticket actually gets filed. Then restart the tool server without it and confirm the agent produces a read-only fallback summary instead of a hard failure.
