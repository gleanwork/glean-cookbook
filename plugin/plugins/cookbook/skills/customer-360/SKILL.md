---
name: customer-360
description: 'One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.'
disable-model-invocation: true
---

Build "Customer 360: an account page built from your own content" following https://developers.glean.com/cookbook/customer-360

1. **Pick a path**
   Path A (Platform Search + Chat) builds an open-ended explorable dashboard: parallel search.query tiles and POST /api/chat for journey summary and saved prompts. Path B (Platform Agents) keeps the same page UX but runs synthesis through glean.agents.createRun against a template Account Brief agent.

## Reference

Platform-only recipe. Search: glean.search.query -> POST /api/search, results[].title/url/snippets (string[]). Chat: fetch POST /api/chat (until glean.chat.create ships); request {input, stream:false, store:true}; response output[].content[] type=output_text with annotations[].sources[]. Agents: glean.agents.createRun(request, agentId) -> POST /api/agents/{agent_id}/runs; stream:false returns PlatformAgentRunWaitResponse synchronously (no polling); messages use role USER|GLEAN_AI and content[{text,type:text}]. Experimental opt-in via X_GLEAN_INCLUDE_EXPERIMENTAL. Do NOT teach glean.client.chat.create, glean.client.search.query, or glean.client.agents.run. Tokens server-side only. The account and its facts come from the reader's own instance: nothing here may hardcode an account name, ARR, seat count or renewal date. An earlier draft of this recipe was written against a demo corpus that no longer exists, which made the page display one fictional customer's numbers regardless of what was retrieved. Treat an empty retrieval as a first-class state and render it as such -- for an app that speaks about named customers, an uncited claim is worse than a blank field.

## Authentication

{{> auth-client-api}}

## Verify

{{> verify-gate}}

- **Query:** "What's the status of our renewal with that account?"
  **Expected:** Returns a non-empty answer citing real documents about the account you built the page around. Substitute the account name when you ask it — the page is built around whichever one you pick, so there is no fixed query text here.
- **Query:** "Give me a customer summary"
  **Expected:** Synthesizes across more than one source, with a citation per claim, rather than restating a single document.
- **Query:** "What are the renewal risks?"
  **Expected:** Either names risks grounded in cited content, or says it has none to report. It must not infer risk the sources don't support — an account with no recorded risk is a real answer, not a gap to fill.
