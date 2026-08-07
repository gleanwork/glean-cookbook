---
name: build-engineering-portal
description: 'The end-to-end showcase — index a developer catalog into Glean, then embed permission-aware search and chat back into the portal your team already uses.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `SEARCH`, `CHAT`
- A Glean instance where you can add a custom datasource
- A Glean-issued Indexing API token
- Node.js 18+ to run the portal app locally

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

Index the service catalog with an Indexing API token, then embed permission-aware search and chat with SEARCH and CHAT access. Keep credentials server-side. Join only non-empty CONTENT fragments, collect citations from fragment.citation.sourceDocument, and treat an empty completed response as a retryable failure.

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

{{> verify-gate-web-sdk}}

{{> verify-gate}}

- **Query:** "How do I find out who is on call?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL from your indexed engineering content.
- **Query:** "How do I deploy a service?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "What's our incident response process?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
