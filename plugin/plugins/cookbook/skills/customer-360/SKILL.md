---
name: customer-360
description: "Sam Reyes's Globex account page — KPI header, parallel Platform Search tiles, journey summary, and saved prompts — built two ways with Platform Search+Chat and Platform Agents."
disable-model-invocation: true
---

Build "Acme Account Journey: Customer 360 for sales" following https://developers.glean.com/cookbook/customer-360

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
   Fill in GLEAN_API_TOKEN and GLEAN_INSTANCE. Set GLEAN_USE_FIXTURE=true for contract-only verification without live Platform handlers.

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
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and GLEAN_AGENT_ID (Account Brief agent). Use GLEAN_USE_FIXTURE=true until the agent exists.

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

Platform-only recipe. Search: glean.search.query -> POST /api/search, results[].title/url/snippets (string[]). Chat: fetch POST /api/chat (until glean.chat.create ships); request {input, stream:false, store:true}; response output[].content[] type=output_text with annotations[].sources[]. Agents: glean.agents.createRun(request, agentId) -> POST /api/agents/{agent_id}/runs; stream:false returns PlatformAgentRunWaitResponse synchronously (no polling); messages use role USER|GLEAN_AI and content[{text,type:text}]. Experimental opt-in via X_GLEAN_INCLUDE_EXPERIMENTAL. Do NOT teach glean.client.chat.create, glean.client.search.query, or glean.client.agents.run. Tokens server-side only. Corpus: sales-globex-account-notes, sales-globex-renewal-status, sales-globex-security-questionnaire. Persona: sam.reyes@acme.example.com.

## Authentication

{{> auth-client-api}}

## Verify

{{> verify-gate}}

- **Query:** "What's the status of the Globex renewal?"
  **Expected:** Answer cites sales-globex-renewal-status with renewal date 2026-09-30, on-track status, and open items (DPA / procurement).
- **Query:** "Customer summary for Globex"
  **Expected:** Synthesis cites account notes and renewal (ARR, seats, owner Sam Reyes, renewal date).
- **Query:** "What are the renewal risks for Globex?"
  **Expected:** Cites renewal open items; overall risk stated as low is a fact from the corpus, not missing evidence.
