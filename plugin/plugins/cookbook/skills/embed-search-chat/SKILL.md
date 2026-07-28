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

Verify by running the app and issuing a search; results must respect my
Glean permissions.

## Setup

- Scaffold web SDK embed

## Reference

Embeds Glean search and chat into an existing web app via the Glean Web SDK npm package @gleanwork/web-sdk (renderSearchBox, renderSearchResults, renderChat named exports; script-tag fallback exposes the same methods on window.GleanWebSDK). Pass the backend option to route users directly to the instance. Auth is Glean SSO by default or server-to-server tokens minted by a backend holding an admin API key with SEARCH and CHAT scopes. All results are permission-aware per user.

## Authentication

This recipe needs `web-sdk-cookie` or `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## Language

Ask me which language to build in before starting: TypeScript, JavaScript.

## House style

This recipe renders a Web SDK UI — apply the cookbook's shared conventions (see the `cookbook-conventions` skill in this plugin): the real Acme logomark (not a plain colored square), a 480–500px-tall container, and `initialMessage` set to this recipe's own first demo query so it opens into a real answer instead of an empty landing screen.
