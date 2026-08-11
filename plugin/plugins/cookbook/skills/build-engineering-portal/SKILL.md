---
name: build-engineering-portal
description: 'The end-to-end showcase — index a developer catalog into Glean, then embed permission-aware search and chat back into the portal your team already uses.'
disable-model-invocation: true
---

## Before you start

- A Glean instance where you can add a custom datasource
- A Glean-issued Indexing API token
- Node.js 18+ to run the portal app locally

Ask these before running commands. Ask one at a time, waiting for each
answer before asking the next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- Which custom datasource should receive the service catalog?
- Where is the service catalog data to index?

Cookie SSO requires the user's normal signed-in browser. Never open or automate the app yourself.

Build the "Engineering portal with Glean" flagship recipe from
https://developers.glean.com/cookbook/build-engineering-portal

Resolve my backend from the work email already supplied with the cookbook resolver. Index the supplied service catalog into the named datasource with the open-source indexing SDK, keeping the Indexing API token server-side. Then embed Glean search and chat with Web SDK cookie SSO. Style the portal shell per the house style below, run it, and give me the URL to open in my normal signed-in browser. See Verify below for the required checks.

## Open the running recipe

{{> run-existing-app}}

## Setup

- Scaffold connector
- Scaffold web SDK embed

## Reference

Index the service catalog with a server-side Indexing API token. Embed search and chat with Web SDK cookie SSO, then have the user verify it in their normal signed-in browser.

## Authentication

This recipe offers a path choice. Apply the block matching the path the user picks:

### `indexing-token`

{{> auth-indexing-token}}

### `web-sdk-cookie`

{{> auth-web-sdk-cookie}}

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
