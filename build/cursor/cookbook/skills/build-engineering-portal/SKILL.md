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

Flagship showcase composing the custom-connector and Web SDK embed recipes: a service-catalog portal whose catalog is indexed into Glean via the indexing SDK, with Glean search and chat embedded back into the portal UI. Requires a Glean-issued Indexing API token for the connector and SEARCH/CHAT scopes for the embed. A chat run that invoked a server tool can return HTTP 200 with the run unfinished: the CONTENT message is present but its fragments carry no text, the final message is a SERVER_TOOL, and no error field appears anywhere. Verified live at roughly one run in four for a tool-invoking question. Treat an empty joined answer as a failure and surface it -- rendering the empty string shows a blank answer panel and reads as a broken app.

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

- **Query:** "How do I find out who is on call?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content. Asked this way rather than "who's on call this week?" deliberately: the live roster is answered by a schedule tool with no citable document, so the direct question intermittently returns an answer with no citations, or no answer at all. Verified live -- three runs of the direct form produced all three outcomes; this form returned 3-4 citations every time.
- **Query:** "How do I deploy a service?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "What's our incident response process?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
