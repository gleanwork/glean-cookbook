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

2. **Set the tool server's allow-list**
   Set AUTHORIZED_EMAILS to two real users on your instance: one who should be able to file tickets, one who shouldn't. The server refuses to start on an empty allow-list, since that denies everyone and makes the permitted branch unobservable.

   ```bash
   cd multi-step-agent/tool-server && cp .env.example .env
   ```

3. **Run the tool server**
   Listens on port 8080. Keep this running in its own terminal — the agent calls it over HTTP once registered.

   ```bash
   cd multi-step-agent/tool-server && uv run server.py
   ```

4. **Register the tool**
   Manual, UI-only step — there is no API to create a tool. In Admin > Platform > Tools > Add, register the tool and upload multi-step-agent/tool-server/openapi.yaml as its API spec.

5. **Create the agent**
   Manual, UI-only step. In Agent Builder: paste the recipe's instructions, turn retrieval on, attach the tool you just registered. Copy the agent's ID for the next step.

6. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, GLEAN_AGENT_ID (the ID from the previous step), and the two user emails — GLEAN_PERMITTED_USER_EMAIL must be on the tool server's allow-list, GLEAN_DENIED_USER_EMAIL must not be.

   ```bash
   cd multi-step-agent/invoke-agent && cp .env.example .env
   ```

7. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd multi-step-agent/invoke-agent && uv run main.py
   ```

8. **Verify**
   Confirm the permitted user's ticket actually gets filed, and that the denied user gets a graceful no-write fallback summary instead of a hard failure.

## Reference

Agents API: glean.client.agents.run(agent_id, messages, http_headers) -> AgentRunWaitResponse{run.status, messages}. messages use Message(role, content=[MessageTextBlock(text, type=ContentType.TEXT)]) — distinct from chat.create's ChatMessage/ChatMessageFragment. run_stream() returns a raw SSE string, not an iterator. Tools are registered via the admin console (upload an OpenAPI spec), not an API call. Per-user identity for a run uses the X-Glean-ActAs header on a global/admin token, same as Search. Custom tool servers receive the acting user's email via the Glean-User-Email header, which is where tool-level authorization (governance) is actually enforced for scratch-built tools.

## Authentication

{{> auth-client-api}}

## Verify

{{> verify-gate}}

- **Query:** "Summarize our open incidents and file a tracking ticket"
  **Expected:** Run as the user on the tool server's allow-list: the agent summarizes and the governed tool call succeeds (200, a real ticket id). Run as a user not on it: the tool returns 403 and the agent falls back to a read-only summary rather than failing the run. The governance check must actually fire, not be assumed.
