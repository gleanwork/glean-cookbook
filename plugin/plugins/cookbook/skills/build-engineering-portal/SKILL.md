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

This recipe needs `indexing-token` or `web-sdk-cookie` or `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## Language

Ask me which language to build in before starting: Python, TypeScript.

## House style

This recipe renders a Web SDK UI — apply the cookbook's shared conventions (see the `cookbook-conventions` skill in this plugin): the real Acme logomark (not a plain colored square), a 480–500px-tall container, and `initialMessage` set to this recipe's own first demo query so it opens into a real answer instead of an empty landing screen.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance, with real credentials) and confirmed every query below produces its expected behavior. A build that runs without errors but fails one of these checks is not done — fix it and re-run before reporting success.

- **Query:** "Who's on call for payments-service?"
  **Expected:** Answer names the current on-call owner from the indexed developer catalog, with a citation to that catalog entry.
- **Query:** "What's the deploy and rollback process for payments-service?"
  **Expected:** Answer describes the real deploy/rollback steps from the indexed runbook, with a citation — not a generic, made-up process.
- **Query:** "Summarize PAY-2114"
  **Expected:** Answer summarizes the real indexed PAY-2114 incident ticket content, with a citation to it — not a fabricated summary.
