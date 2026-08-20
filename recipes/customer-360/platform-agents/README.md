# Customer 360 — Platform Agents path

Same account-workspace UX as Path A, but assistant answers and follow-ups run
through **Platform Agents** (`glean.agents.createRun` →
`POST /api/agents/{agent_id}/runs` with `stream: false`). The app runs as you;
there is no act-as / impersonation.

Tiles still use Platform Search so the page stays a Customer 360, not a blank
agent chat.

## Prerequisites

1. Create a **conversational** Account Brief agent in Agent Builder with
   template sections (Overview, Renewal, Risks, Security) and retrieval on your
   company sales docs. It must be conversational: this page sends a question and
   reads the reply, so a form-triggered agent will not work here.
2. Copy the agent id into `GLEAN_AGENT_ID` (server-only — never expose to the browser).
3. Your token needs the **SEARCH** and **AGENTS** scopes, because tiles still
   call Platform Search while briefs call Platform Agents.
4. Instruct the Account Brief agent to cite sources as markdown links
   (`[title](url)`); the recipe also falls back to bare `https://` URLs.

Platform calls set `X_GLEAN_INCLUDE_EXPERIMENTAL=true` for you.

Expected input: conversational `messages` with a USER text block (not a form
`input` object). A form-triggered agent rejects that with
`invalid user input fields: missing input for required 1 fields`.

To use a form-triggered agent, list the fields it declares with
`glean.agents.getSchemas` (`GET /api/agents/{agent_id}/schemas`):

```ts
const schemas = await glean.agents.getSchemas(agentId);
// input_schema is JSON Schema; field labels live under properties.
console.log(Object.keys(schemas.input_schema.properties ?? {}));
// ['Account Name', 'Company LinkedIn', 'Company Website']
```

Then pass those exact names in `server.ts` — they are the agent's own labels,
not the recipe's variable names:

```ts
const result = await glean.agents.createRun(
  {
    input: { 'Account Name': accountName() },
    messages: [{ role: 'USER', content: [{ text: prompt, type: 'text' }] }],
    stream: false,
  },
  agentId,
);
```

## Setup

```bash
npm install
npm run login
```

`npm run login` finds your Glean tenant from your work email, opens a browser
for you to approve access, and writes `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN`
into a new `.env`. If your tenant cannot use OAuth, skip that command: copy
`.env.example` to `.env` and fill in those two values yourself, using a Glean
API token that carries the **SEARCH** and **AGENTS** scopes.

Signing in fills in neither the account nor the agent. Open `.env` and set
`GLEAN_ACCOUNT_NAME` to one of your own customers, spelled the way your Glean
documents spell it, and `GLEAN_AGENT_ID` to the agent you built above.

## Verify, then run

```bash
npm run verify
npm start
```

## Verify

Requires a reachable Account Brief agent. Missing or unauthorized agents fail
with an explicit error.
