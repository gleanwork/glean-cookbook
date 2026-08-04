# Customer 360 — Platform Agents path

Same the account you pick account page UX as Path A, but journey summary, saved prompts, and
follow-ups run through **Platform Agents** (`glean.agents.createRun` →
`POST /api/agents/{agent_id}/runs` with `stream: false`).

Tiles still use Platform Search (or fixtures) so the page stays a Customer 360,
not a blank agent chat.

## Prerequisites (live mode)

1. Create an **Account Brief** agent in Agent Builder with template sections
   (Overview, Renewal, Risks, Security) and retrieval on your company sales docs.
2. Copy the agent id into `GLEAN_AGENT_ID` (server-only — never expose to the browser).
3. Token needs **SEARCH + AGENTS** scopes (tiles still call Platform Search;
   briefs call Platform Agents). Set `X_GLEAN_INCLUDE_EXPERIMENTAL=true`.
4. Instruct the Account Brief agent to cite sources as markdown links
   (`[title](url)`); the recipe also falls back to bare `https://` URLs.

Expected input: conversational `messages` with a USER text block (not a form
`input` object). If your agent is form-triggered, adapt `server.ts` to pass
`input: { account: "the account you pick", question }` instead.

## Setup

```bash
cp .env.example .env
npm install
```

Fixture mode (`GLEAN_USE_FIXTURE=true`) is the default verification path because
Agent Builder setup is external.

## Run

```bash
npm start
```

## Verify

```bash
npm run verify:fixture
```

Optional live check (requires credentials + `GLEAN_AGENT_ID`):

```bash
npm run verify:live
```

`verify:live` calls `glean.agents.get` / `getSchemas` before `createRun` and
fails clearly if the agent is missing or unauthorized.
