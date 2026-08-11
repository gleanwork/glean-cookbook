---
name: embed-search-chat
description: 'Put permission-aware Glean search and chat directly inside an internal app with the Web SDK, so your team gets answers where they already work.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `SEARCH`, `CHAT`
- A Glean instance with content indexed
- Your Glean web app domain (typically app.glean.com — see admin/about-glean)
- A frontend app or page where you can install an npm package (or add a script tag) and a container element

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What topic do you know exists in your Glean content?

Cookie SSO requires the user's normal signed-in browser. Never open or automate the app yourself.

Embed Glean search and chat in my internal web app using the Glean Web
SDK, following the recipe at
https://developers.glean.com/cookbook/embed-search-chat

Steps:

1. Resolve my Glean backend from the work email already supplied by running the cookbook plugin's resolve-backend.mjs script.
2. Install the SDK: npm install @gleanwork/web-sdk. (If the app has no
   build toolchain, fall back to the script tag from my Glean app domain:
   <script defer src="https://{GLEAN_APP_DOMAIN}/embedded-search-latest.min.js"></script>
   — the same methods appear on window.GleanWebSDK.)
3. Add a search box and results container, then:
   import { renderSearchBox, renderSearchResults } from "@gleanwork/web-sdk";
   renderSearchBox(searchBoxElement, { backend, onSearch: (query) =>
   renderSearchResults(resultsElement, { query }) });
4. Add a chat container: position: relative, display: block, width: 100%,
   height: 480px. Use the topic already supplied as initialMessage so the user-mediated check is relevant to my tenant.
5. Default SSO auth needs no extra configuration. If I ask for
   server-to-server auth instead, follow
   https://developers.glean.com/libraries/web-sdk/authentication/server-to-server
   and keep the API key strictly server-side.

See Verify below for what a correct build must do.

## Open the running recipe

Once the integration is running, report its exact page URL or route as a clickable Markdown link.
Do not open or automate it. Ask the user to click it in their normal browser where they are already
signed in to Glean and confirm the page is ready. Then give the first verification action.

## Setup

- Scaffold web SDK embed

## Reference

Use @gleanwork/web-sdk named exports renderSearchBox, renderSearchResults, and renderChat; the script-tag build exposes the same methods on window.GleanWebSDK. Set backend explicitly. Prefer the user's Glean SSO session; token auth must be minted by a backend and never exposed in browser code. Results remain permission-filtered for the signed-in user. Give every embedded widget an explicitly sized container.

## Authentication

No explicit credential handling — the Web SDK's default `authMethod: 'sso'` relies on the user's
existing browser session with Glean (they're already logged in, or get redirected to log in).
Don't ask for a token or walk through OAuth for this path; that's a different, unnecessary auth
model. If the recipe or user asks for server-to-server auth instead, that's a deliberate
opt-out of cookie auth into the `client-api-oauth-or-token` flow — don't blend the two.

## Language

Ask me which language to build in before starting: TypeScript, JavaScript.

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

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.

- **Query:** "Who should I ask about billing?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.

- **Query:** "Summarize our latest product update"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
