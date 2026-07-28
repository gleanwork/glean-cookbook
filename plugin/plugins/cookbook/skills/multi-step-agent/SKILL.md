---
name: multi-step-agent
description: 'Build a Glean agent that plans, retrieves, and acts through a governed custom tool — with a safe fallback when the tool is denied.'
disable-model-invocation: true
---

Build the governed multi-step agent from
https://developers.glean.com/cookbook/multi-step-agent

1. Register the recipe's custom tool (an incident-ticket-creation HTTP
   tool) in the Glean admin console (Admin > Platform > Tools > Add) —
   this is a manual/admin-console step, there is no API to create a
   tool. Upload the recipe's openapi.yaml as the tool's API spec.
2. Create an agent in the Agent Builder (also a UI step, not an API
   call): instructions from the recipe, retrieval on, the tool
   attached. Copy the agent's ID.
3. Invoke via glean.client.agents.run(agent_id=..., messages=[...],
   http_headers={"X-Glean-Act-As": email}) — NOT chat.create's
   ChatMessage/ChatMessageFragment shape; agents use Message/
   MessageTextBlock instead. run_stream() returns raw SSE text (a
   string), not a parsed event iterator — use run() unless you're
   ready to parse SSE yourself.
4. Demo both branches by running as two different users: a permitted
   user (Acme-Engineering) gets the ticket filed; a non-permitted
   user gets a graceful no-write fallback summary because the tool
   server returned 403 and the agent's own instructions handle that
   case.

## Reference

Agents API: glean.client.agents.run(agent_id, messages, http_headers) -> AgentRunWaitResponse{run.status, messages}. messages use Message(role, content=[MessageTextBlock(text, type=ContentType.TEXT)]) — distinct from chat.create's ChatMessage/ChatMessageFragment. run_stream() returns a raw SSE string, not an iterator. Tools are registered via the admin console (upload an OpenAPI spec), not an API call. Per-user identity for a run uses the X-Glean-Act-As header on a global/admin token, same as Search. Custom tool servers receive the acting user's email via the Glean-User-Email header, which is where tool-level authorization (governance) is actually enforced for scratch-built tools.

## Authentication

This recipe needs `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.
