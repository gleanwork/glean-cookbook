---
name: embed-search-chat
description: 'Put permission-aware Glean search and chat directly inside an internal app with the Web SDK, so your team gets answers where they already work.'
disable-model-invocation: true
---

Embed Glean search and chat in my internal web app using the Glean Web
SDK, following the recipe at
https://developers.glean.com/cookbook/embed-search-chat

Steps:

1. Ask me for my Glean backend URL (https://{instance}-be.glean.com).
2. Install the SDK: npm install @gleanwork/web-sdk. (If the app has no
   build toolchain, fall back to the script tag from my Glean app domain:
   <script defer src="https://{GLEAN_APP_DOMAIN}/embedded-search-latest.min.js"></script>
   — the same methods appear on window.GleanWebSDK.)
3. Add a search box and results container, then:
   import { renderSearchBox, renderSearchResults } from "@gleanwork/web-sdk";
   renderSearchBox(searchBoxElement, { backend, onSearch: (query) =>
   renderSearchResults(resultsElement, { query }) });
4. Add a chat container: position: relative, display: block, width: 100%,
   height: 480px — any shorter and long answers scroll awkwardly, any
   taller and you get dead space below Glean's own chat landing view. Then:
   import { renderChat } from "@gleanwork/web-sdk";
   renderChat(containerElement, { backend, initialMessage: "What's our PTO policy?" });
   initialMessage opens straight into a real cited answer instead of an
   empty landing screen, and doubles as your on-load verification.
5. Default SSO auth needs no extra configuration. If I ask for
   server-to-server auth instead, follow
   https://developers.glean.com/libraries/web-sdk/authentication/server-to-server
   and keep the API key strictly server-side.

See Verify below for what a correct build must do.

## Setup

- Scaffold web SDK embed

## Reference

Embeds Glean search and chat into an existing web app via the Glean Web SDK npm package @gleanwork/web-sdk (renderSearchBox, renderSearchResults, renderChat named exports; script-tag fallback exposes the same methods on window.GleanWebSDK). Pass the backend option to route users directly to the instance. Auth is Glean SSO by default or server-to-server tokens minted by a backend holding an admin API key with SEARCH and CHAT scopes. All results are permission-aware per user. A chat run that invoked a server tool can return HTTP 200 with the run unfinished: the CONTENT message is present but its fragments carry no text, the final message is a SERVER_TOOL, and no error field appears anywhere. Verified live at roughly one run in four for a tool-invoking question. Treat an empty joined answer as a failure and surface it -- rendering the empty string shows a blank answer panel and reads as a broken app.

## Authentication

This recipe offers a path choice. Apply the block matching the path the user picks:

### `web-sdk-cookie`

{{> auth-web-sdk-cookie}}

### `client-api-oauth-or-token`

{{> auth-client-api}}

## Language

Ask me which language to build in before starting: TypeScript, JavaScript.

## House style

{{> web-sdk-house-style}}

{{> brand-kit}}

{{> web-sdk-sizing}}

## Verify

{{> verify-gate}}

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Who should I ask about billing?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Summarize our latest product update"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
