---
name: build-engineering-portal
description: 'The end-to-end showcase — index a developer catalog into Glean, then embed permission-aware search and chat back into the portal your team already uses.'
---

Build the "Engineering portal with Glean" flagship recipe from
https://developers.glean.com/cookbook/build-engineering-portal

It composes two building blocks:

1. Index the portal's service catalog into Glean with the open-source
   indexing SDK (follow
   https://developers.glean.com/api-info/indexing/getting-started/overview).
2. Embed Glean search and chat into the portal UI with the Web SDK (see
   https://developers.glean.com/cookbook/embed-search-chat).

Ask me for: my Glean instance/backend domain, an Indexing API token, and
my Glean web app domain. Verify at the end that a search for a service
name returns the indexed catalog entry, respecting my permissions.

## Setup

- Scaffold connector
- Scaffold web SDK embed

## Reference

Flagship showcase composing the custom-connector and Web SDK embed recipes: a service-catalog portal whose catalog is indexed into Glean via the indexing SDK, with Glean search and chat embedded back into the portal UI. Requires a Glean-issued Indexing API token for the connector and SEARCH/CHAT scopes for the embed.
