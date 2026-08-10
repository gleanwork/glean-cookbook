# Customer 360 — Platform Agents path

Same account-workspace UX as Path A, but assistant answers and follow-ups run
through **Platform Agents** (`glean.agents.createRun` →
`POST /api/agents/{agent_id}/runs` with `stream: false`). The app runs as you;
there is no act-as / impersonation.

Tiles still use Platform Search so the page stays a Customer 360, not a blank
agent chat.

## Prerequisites

1. Create an **Account Brief** agent in Agent Builder with template sections
   (Overview, Renewal, Risks, Security) and retrieval on your company sales docs.
2. Copy the agent id into `GLEAN_AGENT_ID` (server-only — never expose to the browser).
3. Token needs **SEARCH + AGENTS** scopes (tiles still call Platform Search;
   briefs call Platform Agents). Set `X_GLEAN_INCLUDE_EXPERIMENTAL=true`.
4. Instruct the Account Brief agent to cite sources as markdown links
   (`[title](url)`); the recipe also falls back to bare `https://` URLs.

Expected input: conversational `messages` with a USER text block (not a form
`input` object). If your agent is form-triggered, adapt `server.ts` to pass
`input: { account: "<name>", question }` instead.

## Setup

```bash
npm install
npm run login
```

The login command discovers your tenant and uses OAuth. Set `GLEAN_ACCOUNT_NAME` and
`GLEAN_AGENT_ID` in the generated `.env`.

## Verify, then run

```bash
npm run verify
npm start
```

## Verify

Requires a reachable Account Brief agent. Missing or unauthorized agents fail
with an explicit error.
