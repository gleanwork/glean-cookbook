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

Report the running integration's exact page URL or route as a clickable Markdown link.
Do not open or automate it. Ask the user to click it in their normal signed-in browser and confirm the page is ready.
Then give the first verification action.

## Setup

- Scaffold connector
- Scaffold web SDK embed

## Reference

Index the service catalog with a server-side Indexing API token. Embed search and chat with Web SDK cookie SSO, then have the user verify it in their normal signed-in browser.

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

## Language

Ask me which language to build in before starting: Python, TypeScript.

## House style

This recipe renders a Web SDK UI. Apply the cookbook's shared conventions below.

For scaffolded recipes, link `/glean-cookbook.css` and compose its existing primitives: `.layout`,
`.card`, `.hero`, `.eyebrow`, `.assistant-shell`, `.assistant-header`, `.assistant-thread`,
`.assistant-composer`, `.pill`, `.note`, `.empty`, `.hit`, `.citations`, `.step`, `.msg`, `.kpi`,
and `.sdk-embed`. Use the supplied design tokens for recipe-specific CSS.

Use `public/glean-logomark.svg`; do not recreate the mark. For a build without scaffolded assets,
copy the tokens and mark from `https://github.com/gleanwork/glean-cookbook/tree/main/brand`.

Style only the surrounding page for Web SDK components. The embedded Glean UI supplies its own
branding. If the user wants their company's identity, replace the logo and accent consistently.

Keep the main interaction above the fold on desktop. Use an internal scroll region instead of
making the composer disappear below a long answer, and put the assistant before supporting panels
on mobile. Avoid debug-console layouts, oversized empty cards, and a separate answer box below the
form.

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
