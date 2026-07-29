---
name: multi-step-agent
description: 'Build a Glean agent that plans, retrieves, and acts through a governed custom tool — with a safe fallback when the tool is denied.'
disable-model-invocation: true
---

Build "Multi-step agent with governed tools" following https://developers.glean.com/cookbook/multi-step-agent

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/multi-step-agent multi-step-agent
   ```

2. **Install dependencies**

   ```bash
   cd multi-step-agent/tool-server && pip install -r requirements.txt && cd ../invoke-agent && pip install -r requirements.txt
   ```

3. **Run the tool server**
   Listens on port 8080. Keep this running in its own terminal — the agent calls it over HTTP once registered.

   ```bash
   cd multi-step-agent/tool-server && python server.py
   ```

4. **Register the tool**
   Manual, UI-only step — there is no API to create a tool. In Admin > Platform > Tools > Add, register the tool and upload multi-step-agent/tool-server/openapi.yaml as its API spec.

5. **Create the agent**
   Manual, UI-only step. In Agent Builder: paste the recipe's instructions, turn retrieval on, attach the tool you just registered. Copy the agent's ID for the next step.

6. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and GLEAN_AGENT_ID (the ID from the previous step).

   ```bash
   cd multi-step-agent/invoke-agent && cp .env.example .env
   ```

7. **Run it**

   ```bash
   python main.py
   ```

8. **Verify**
   Run as a permitted user (Acme-Engineering) and confirm the ticket actually gets filed; run as a non-permitted user and confirm a graceful no-write fallback summary instead of a hard failure.

## Reference

Agents API: glean.client.agents.run(agent_id, messages, http_headers) -> AgentRunWaitResponse{run.status, messages}. messages use Message(role, content=[MessageTextBlock(text, type=ContentType.TEXT)]) — distinct from chat.create's ChatMessage/ChatMessageFragment. run_stream() returns a raw SSE string, not an iterator. Tools are registered via the admin console (upload an OpenAPI spec), not an API call. Per-user identity for a run uses the X-Glean-Act-As header on a global/admin token, same as Search. Custom tool servers receive the acting user's email via the Glean-User-Email header, which is where tool-level authorization (governance) is actually enforced for scratch-built tools.

## Authentication

This recipe needs `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance, with real credentials) and confirmed every query below produces its expected behavior. A build that runs without errors but fails one of these checks is not done — fix it and re-run before reporting success.

- **Query:** "Summarize open payments incidents and file a tracking ticket"
  **Expected:** Run as an Acme-Engineering user (e.g. marcus.webb@acme.example.com): the agent summarizes open incidents and the governed tool call succeeds (200, a real ticket ID comes back). Run as a non-Engineering user (e.g. dana.okafor@acme.example.com): the tool server returns 403 and the agent falls back to a read-only summary instead of failing the whole run — the governance check must actually run, not be assumed.
