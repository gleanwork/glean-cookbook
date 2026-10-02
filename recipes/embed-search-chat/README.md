# Embed Search & Chat

This recipe embeds Glean Search and Chat in an internal application using the
pinned public Web SDK and the signed-in user's browser session. Search and Chat
remain permission-aware for that user. The browser does not receive an API key
or other secret.

## Existing app

Install the exact SDK version:

```bash
npm install @gleanwork/web-sdk@2.4.0
```

Add two positioned, explicitly sized containers for Search Box and Search
Results, then use [`snippet-02.ts`](./snippets/snippet-02.ts). Add a Chat
container that is at least 480px high and use
[`snippet-03.ts`](./snippets/snippet-03.ts).

Set these values as application/deployment configuration, not as end-user inputs:

- `backend`: the HTTPS backend origin for your Glean instance;
- `webAppUrl`: the exact Web app URL shown in Glean Admin → About Glean;
- `authMethod: 'sso'`: use the signed-in Glean browser session.

The browser should never offer a tenant/backend picker or accept a global API
key. For an app without a package build toolchain, use the current script-tag
instructions from the [Web SDK documentation](https://developers.glean.com/libraries/web-sdk/overview).
Do not use the backend hostname as the Web app URL and do not proxy the full
Glean app.

If a vanity tenant hostname redirects an embedded `/frame/*` request to the
generic `app.glean.com` front end, confirm the exact Web app URL in Admin → About
Glean. The generic front end may route to the tenant backend, but it is not a
substitute for confirming the tenant's supported Web app configuration. Do not
use the backend hostname or proxy the full app.

## React example

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/embed-search-chat/react embed-search-chat
cd embed-search-chat
npm install
cp .env.example .env.local
npm run configure -- --email "you@company.com"
# Or set VITE_GLEAN_BACKEND directly when the tenant backend is already known.
# Set VITE_GLEAN_WEB_APP_URL in .env.local.
npm run dev
```

The configure command resolves the backend once during setup. The runtime app
uses the signed-in Glean SSO session; it does not ask users to select a backend
or provide runtime credentials.

Open the exact local URL printed by Vite in the authenticated browser session.
Verify autocomplete, permission-aware Search Results with citations, Chat with
citations, and the same checks with a second authorized user.
