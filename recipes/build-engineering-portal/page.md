## Problem

Service ownership, on-call, and docs live in a portal nobody can search,
and the knowledge about those services lives everywhere else. This recipe
turns a lightweight service-catalog portal into the one-stop shop: its
catalog becomes searchable in Glean, and Glean's permission-aware search
and chat come back into the portal itself.

## Steps

1. Index the catalog: push the portal's service catalog (services, owners,
   runbooks) into Glean with the
   [Indexing API](/api-info/indexing/getting-started/overview) and the
   open-source indexing SDK. (A dedicated custom-connector recipe is
   coming to the cookbook.) Verify a service shows up in Glean search.

2. Embed search and chat: follow the
   [Embed search & chat recipe](/cookbook/embed-search-chat) inside the
   portal — the Web SDK script tag, a search route, and a chat container.

3. Ground answers in the catalog: with the catalog indexed, chat answers
   questions like "who's on call for payments-service?" from the portal's own
   data — permission-aware, with citations back to the catalog entries.

:::note

The clonable portal starter repo is in progress — until it lands, this
recipe composes the two linked recipes against your own portal or a plain
Next.js app.

:::

## Take it further

- Add an on-call answer card to the portal backed by a Client API search call.
- Extend the connector with incremental sync and identity mapping so catalog
  permissions mirror your org.
- Wire the portal's "ask" box to open Glean Chat with the current service as
  context.
