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

Indexing API operations accept Glean-issued tokens only — OAuth does not apply here regardless of
tenant configuration (per developers.glean.com/api-info/client/authentication/oauth). Don't run an
OAuth detection chain for an indexing recipe; go straight to asking for a Glean
Indexing API token (`GLEAN_INDEXING_API_TOKEN`) and server URL (`GLEAN_SERVER_URL`), the same way
`index-custom-source` already does.

### `web-sdk-cookie`

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into the `client-api-oauth-or-token` flow — don't blend the two.

### `client-api-oauth-or-token`

Use the first available credential path:

1. **Glean OAuth:** ask for the user's work email and run:
   ```bash
   node <plugin-root>/scripts/resolve-backend.mjs <work-email>
   ```
   If `oauthAvailable` is true, register a public client through the returned backend's Dynamic
   Client Registration endpoint and use authorization code + PKCE. Reuse the client id and refresh
   token.
2. **External IdP OAuth:** if Glean OAuth is unavailable, ask whether the user's administrator has
   configured Okta, Azure AD, Google, or another IdP for Glean Client API access. Use that sign-in
   flow when available.
3. **Glean API token:** otherwise request a token carrying the scopes declared by the recipe.

Do not use client credentials for an end-user Client API integration. Keep access and refresh tokens
server-side.

## Language

Ask me which language to build in before starting: Python, TypeScript.

## House style

This recipe renders a Web SDK UI. Apply the cookbook's shared conventions below.

For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.frame`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.chat-row`, `.msg`,
`.kpi`, and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use `public/glean-logomark.svg`; do not recreate the mark. For a build without scaffolded assets,
copy the tokens and mark from `https://github.com/gleanwork/glean-cookbook/tree/main/brand`.

Style only the surrounding page for Web SDK components. The embedded Glean UI supplies its own
branding. If the user wants their company's identity, replace the logo and accent consistently.

Give `renderChat`, `renderSearchBox`, and `renderSearchResults` a positioned container with explicit
width and height; 480–500px is a good default. When the experience should open directly into a cited
answer, ask the user for a topic they know exists in their Glean instance and pass that question as
`initialMessage`.

## Verify

If the selected path uses Web SDK cookie SSO, do not open the app in an agent-controlled browser,
incognito window, Playwright, or any other browser automation. Those browsers do not carry the
user's existing Glean session. Start the development server, keep it running, report the exact local
URL printed by the server, and ask the user to open that URL in their normal browser where they are
signed in to Glean. Wait for the user to report the result before claiming the live check passed.

Treat the queries below as acceptance scenarios, not as assumptions about what every Glean instance
contains. For a live check, ask the user for an equivalent topic they know exists in their instance
and confirm the same response properties: grounding, citations, permission filtering, and explicit
no-answer behavior where applicable. Use fixture or automated checks for corpus-independent
behavior. Do not claim a live check passed when the required content, credentials, user session, or
user confirmation was unavailable.

- **Query:** "How do I find out who is on call?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL from your indexed engineering content.
- **Query:** "How do I deploy a service?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "What's our incident response process?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
