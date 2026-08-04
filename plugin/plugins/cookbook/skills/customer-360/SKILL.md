---
name: customer-360
description: 'One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.'
disable-model-invocation: true
---

Build "Customer 360: an account page built from your own content" following https://developers.glean.com/cookbook/customer-360

1. **Pick a path**
   Path A (Platform Search + Chat) builds an open-ended explorable dashboard: parallel search.query tiles and POST /api/chat for journey summary and saved prompts. Path B (Platform Agents) keeps the same page UX but runs synthesis through glean.agents.createRun against a template Account Brief agent.

### Platform Search Chat

Path A — parallel Platform Search tiles + Platform Chat synthesis

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-search-chat customer-360
   ```

2. **Install dependencies**

   ```bash
   cd customer-360 && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN and GLEAN_SERVER_URL. Set GLEAN_USE_FIXTURE=true for contract-only verification without live Platform handlers.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   npm start
   ```

5. **Verify**
   Runs fixture-mode contract verification for /api/account tiles and the three demo chat queries.
   ```bash
   npm run verify:fixture
   ```

### Platform Agents

Path B — Platform Agents createRun for prescriptive account briefs

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-agents customer-360
   ```

2. **Install dependencies**

   ```bash
   cd customer-360 && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_SERVER_URL, and GLEAN_AGENT_ID (Account Brief agent). Use GLEAN_USE_FIXTURE=true until the agent exists.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   npm start
   ```

5. **Verify**
   Fixture-first verification. Optional: npm run verify:live checks agents.get / getSchemas before createRun.
   ```bash
   npm run verify:fixture
   ```

## Reference

Platform-only recipe. Search: glean.search.query -> POST /api/search, results[].title/url/snippets (string[]). Chat: fetch POST /api/chat (until glean.chat.create ships); request {input, stream:false, store:true}; response output[].content[] type=output_text with annotations[].sources[]. Agents: glean.agents.createRun(request, agentId) -> POST /api/agents/{agent_id}/runs; stream:false returns PlatformAgentRunWaitResponse synchronously (no polling); messages use role USER|GLEAN_AI and content[{text,type:text}]. Experimental opt-in via X_GLEAN_INCLUDE_EXPERIMENTAL. Do NOT teach glean.client.chat.create, glean.client.search.query, or glean.client.agents.run. Tokens server-side only. The account and every figure on the page come from the reader's own instance. Nothing may hardcode an account name, owner, ARR, seat count or renewal date: an earlier version returned a fixed demo account on the live path, so the KPI header showed one fictional customer's numbers whatever retrieval returned. Use GLEAN_SERVER_URL rather than deriving the backend from an instance name, and GLEAN_ACCOUNT_NAME for the account.

## Authentication

{{> auth-client-api}}

## Verify

{{> verify-gate}}

- **Query:** "What's the status of our renewal with that account?"
  **Expected:** Returns a non-empty answer citing real documents about the account you built the page around. Substitute the name when you ask — there is no fixed query text for a page built around whichever account you pick.
- **Query:** "Give me a customer summary"
  **Expected:** Synthesizes across more than one source with a citation per claim, rather than restating a single document.
- **Query:** "What are the renewal risks?"
  **Expected:** Either names risks grounded in cited content, or says it has none to report. It must not infer risk the sources don't support, and the KPI header must leave unsupported fields blank rather than showing a figure no document contains.
