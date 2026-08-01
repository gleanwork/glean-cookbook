---
name: build-engineering-portal
description: 'The end-to-end showcase — index a developer catalog into Glean, then embed permission-aware search and chat back into the portal your team already uses.'
disable-model-invocation: true
---

Build the "Engineering portal with Glean" flagship recipe from
https://developers.glean.com/cookbook/build-engineering-portal

It composes two building blocks:

1. Index the portal's service catalog into Glean with the open-source
   indexing SDK (follow
   https://developers.glean.com/api-info/indexing/getting-started/overview).
2. Embed Glean search and chat into the portal UI with the Web SDK (see
   https://developers.glean.com/cookbook/embed-search-chat — same
   container sizing and initialMessage guidance applies here).

Style the portal shell itself per the house style below (real logomark,
teal accent) so the catalog UI and the embedded search/chat feel like one
cohesive app, not two mismatched pieces bolted together.

Ask me for: my Glean instance/backend domain, an Indexing API token, and
my Glean web app domain. See Verify below for what a correct build must do.

## Setup

- Scaffold connector
- Scaffold web SDK embed

## Reference

Flagship showcase composing the custom-connector and Web SDK embed recipes: a service-catalog portal whose catalog is indexed into Glean via the indexing SDK, with Glean search and chat embedded back into the portal UI. Requires a Glean-issued Indexing API token for the connector and SEARCH/CHAT scopes for the embed.

## Authentication

This recipe offers a path choice. Apply the block matching the path the user picks:

### `indexing-token`

{{> auth-indexing-token}}

### `web-sdk-cookie`

{{> auth-web-sdk-cookie}}

### `client-api-oauth-or-token`

{{> auth-client-api}}

## Language

Ask me which language to build in before starting: Python, TypeScript.

## House style

{{> web-sdk-house-style}}

{{> brand-kit}}

{{> web-sdk-sizing}}

## Verify

{{> verify-gate}}

- **Query:** "Who's on call for payments-service?"
  **Expected:** Answer names the current on-call owner from the indexed developer catalog, with a citation to that catalog entry.
- **Query:** "What's the deploy and rollback process for payments-service?"
  **Expected:** Answer describes the real deploy/rollback steps from the indexed runbook, with a citation — not a generic, made-up process.
- **Query:** "Summarize PAY-2114"
  **Expected:** Answer summarizes the real indexed PAY-2114 incident ticket content, with a citation to it — not a fabricated summary.
