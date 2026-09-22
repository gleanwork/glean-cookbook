# Triage one support issue with a Glean Agent

Run one published, conversational support-triage Agent through Glean's
**Platform Agents API**. Give it a support issue URL or description and it
returns a concise summary, evidence, next diagnostic step, and customer-safe
response.

This is the smallest useful Agent example: one input, one direct
`POST /api/agents/{agent_id}/runs` call, and one structured result. It does not
build an Agent, add tools, use A2A, or call the legacy `/rest/api/v1` surface.

## Prerequisites

- Node 20+
- A published conversational Agent that can triage support issues
- The Agent ID from Agent Builder or the Agents API
- OAuth access to run that Agent, or a user-scoped API token for CI

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `GLEAN_SERVER_URL` and `GLEAN_AGENT_ID`. Sign in with the shared
Glean OAuth helper; it stores refreshable credentials outside this project:

```bash
npm run login
```

For tenant discovery, pass your work email:

```bash
npm run login -- --email "you@example.com"
```

For CI or another non-interactive environment, set a user-scoped
`GLEAN_API_TOKEN`. The shared auth package uses that token when present and
otherwise uses the refreshable OAuth grant.

## Run

Pass one support issue URL or description:

```bash
npm run triage -- "The customer reports that search results are stale after a document update: https://example.invalid/ticket/123"
```

The recipe passes an explicit prompt in the run message; no separate prompt
environment variable is required. The prompt asks the Agent to separate
evidence from hypotheses, disclose insufficient context, and use an indexed
Intercom ticket when a live Intercom URL only returns an authenticated
application shell.

## Verify

Run the fixture check without credentials:

```bash
npm run verify:fixture
```

For a live check, set a repeatable issue in `.env` and run:

```bash
GLEAN_SUPPORT_ISSUE="The customer reports stale search results after a document update" npm run verify
```

The recipe uses `@gleanwork/auth` for refreshable OAuth credentials and Node
22.12+'s built-in `fetch` to call
`POST /api/agents/{agent_id}/runs` directly with a Bearer token and
`stream: false`. If Node cannot validate the tenant certificate in a managed
development environment, it retries through the system `curl` TLS stack without
disabling certificate verification. See the
[Create agent run API reference](https://developers.glean.com/api/platform-api/platform-agents-create-run).
