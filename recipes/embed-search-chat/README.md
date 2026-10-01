# Embed Search & Chat

This recipe supports two authentication paths:

- **SSO (original flow):** install the pinned `@gleanwork/web-sdk@2.4.0` package and
  use the snippets to add Search Box, Search Results, and Chat to an existing
  frontend. The widgets use the signed-in Glean browser session.
- **Server token (production fallback):** the host app authenticates the current
  user, exchanges their IDP OAuth token for a short-lived Glean token, and returns
  only that token to the browser. This avoids iframe cookie limitations.

The browser never receives an API key or IDP credential.

## Existing app

Install the exact SDK version:

```bash
npm install @gleanwork/web-sdk@2.4.0
```

Add two positioned, explicitly sized containers for Search Box and Search
Results, then use [`snippet-02.ts`](./snippets/snippet-02.ts). Add a Chat
container that is at least 480px high and use
[`snippet-03.ts`](./snippets/snippet-03.ts).

The snippets show the server-token contract:

```text
GET /api/glean-token
Request: the host app's authenticated session
Response: { "token": "<short-lived-user-token>", "expirationTime": 1700000000 }
```

To retain the original SSO flow, replace the token options with
`authMethod: 'sso'` and omit `authToken`/`onAuthTokenRequired`. The SSO flow requires the user’s Glean session to be available to the embedded
Web SDK frame. If a vanity tenant hostname redirects its `/frame/*` route to
`app.glean.com`, verify the exact Web app URL in Admin → About Glean and use that
supported Web app URL. For this tenant, `https://app.glean.com` renders the
embedded Search and Chat frames successfully; do not use the backend hostname
or invent a proxy for the full app. Use token mode only when the supported Web
app URL still cannot complete embedded SSO.

Set these values as application/deployment configuration, not as end-user inputs:

- `backend`: the HTTPS backend origin for your Glean instance;
- `webAppUrl`: the exact Web app URL shown in Glean Admin → About Glean;
- `authMethod`: `sso` for the original browser flow or `token` for host-managed auth.

For the React example, `npm run configure -- --email "<work-email>"` resolves and
writes the backend once. If the backend is already known, set `VITE_GLEAN_BACKEND`
directly in `.env.local`. The browser should never offer a tenant/backend picker.

For an app without a package build toolchain, use the current script-tag
instructions from the [Web SDK documentation](https://developers.glean.com/libraries/web-sdk/overview).
The same authentication choice and token endpoint contract still apply. Do not
iframe `app.glean.com` directly.

## React example

```bash
npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/embed-search-chat/react embed-search-chat
cd embed-search-chat
npm install
cp .env.example .env.local
npm run configure -- --email "you@company.com"
# Or set VITE_GLEAN_BACKEND directly when the tenant backend is already known.
# Set VITE_GLEAN_WEB_APP_URL and VITE_GLEAN_AUTH_MODE in .env.local.
npm run dev
```

The React example defaults to `VITE_GLEAN_AUTH_MODE=sso`. Set
`VITE_GLEAN_AUTH_MODE=token` and configure `VITE_GLEAN_TOKEN_ENDPOINT` when the
host app supplies server-minted user tokens. Open the exact local URL printed by
Vite in the appropriate authenticated browser session.

Verify autocomplete, permission-aware Search Results with citations, Chat with
citations, token refresh when using token mode, and the same checks with a second
authorized user.

See Glean's [server-to-server authentication guide](https://developers.glean.com/libraries/web-sdk/authentication/server-to-server)
for the token exchange contract.
