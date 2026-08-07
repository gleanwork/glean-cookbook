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

Ask these before running commands:

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

## Setup

- Scaffold web SDK embed

## Reference

Use @gleanwork/web-sdk named exports renderSearchBox, renderSearchResults, and renderChat; the script-tag build exposes the same methods on window.GleanWebSDK. Set backend explicitly. Prefer the user's Glean SSO session; token auth must be minted by a backend and never exposed in browser code. Results remain permission-filtered for the signed-in user. Give every embedded widget an explicitly sized container.

## Authentication

{{> auth-web-sdk-cookie}}

## Language

Ask me which language to build in before starting: TypeScript, JavaScript.

## House style

{{> web-sdk-house-style}}

{{> brand-kit}}

{{> web-sdk-sizing}}

## Verify

{{> verify-gate-web-sdk}}

{{> verify-gate}}

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Who should I ask about billing?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Summarize our latest product update"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
