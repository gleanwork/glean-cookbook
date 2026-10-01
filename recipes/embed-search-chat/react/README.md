# Embed Search & Chat with React

This is a standalone React/Vite example for embedding Glean Search and Chat in an
internal application. It supports both authentication paths:

- **SSO (default):** the original Web SDK flow using the signed-in Glean browser
  session;
- **Server token:** a host-app backend returns a short-lived user-scoped token,
  avoiding iframe cookie limitations.

## Requirements

- Node 20.19+ or 22.12+
- A Glean instance with content indexed
- A Glean Web app URL from Admin → About Glean → Web app URL
- For `token` mode: a host-app backend endpoint that mints short-lived Glean user tokens

## Setup

```bash
npm install
cp .env.example .env.local
npm run configure -- --email "you@company.com"
```

`npm run configure` writes `VITE_GLEAN_BACKEND` into `.env.local` by resolving
the tenant from the supplied work email. If you already know the backend, you
can enter it directly in `.env.local` instead. Both the backend and Web app URL
are setup-time/deployment configuration; this app never asks browser users to
choose a tenant. Set `VITE_GLEAN_WEB_APP_URL` to the exact value in Glean Admin
→ About Glean → Web app URL. Set `VITE_GLEAN_AUTH_MODE=sso` to use the original browser-session
flow, or `VITE_GLEAN_AUTH_MODE=token` to use the host-app token endpoint.

For token mode, set `VITE_GLEAN_TOKEN_ENDPOINT` if the endpoint is not
`/api/glean-token`. The endpoint must return:

```text
GET /api/glean-token
Request: credentials: include
Response: { "token": "<short-lived-user-token>", "expirationTime": 1700000000 }
```

The host endpoint must validate the signed-in user, exchange that user's IDP OAuth
token for a short-lived Glean token through `createAuthToken`, and return only the
user-scoped token and expiry. Keep IDP credentials and Glean admin/API credentials
server-side. Do not replace this endpoint with a global token or an API key. The
backend and Web app URL remain host/deployment configuration even in token mode;
they are not user-selectable runtime inputs.

## Run

```bash
npm run dev
```

Open the exact local URL printed by Vite in your normal browser. In `sso` mode,
open it in a browser where the user is already signed in to Glean. In `token`
mode, open it in the authenticated host-app session that can call the token
endpoint.

If a vanity tenant hostname redirects an embedded `/frame/*` request to
`app.glean.com`, confirm the exact Web app URL in Admin → About Glean. For this
tenant, `https://app.glean.com` renders the embedded Search and Chat frames and
is the working local value. Do not use the backend hostname or proxy the full
app. Use token mode only if the confirmed supported Web app URL still cannot
complete embedded SSO.

Verify that:

1. Search autocomplete appears above the results container.
2. A query returns results from content the signed-in user can access.
3. Chat renders and answers the configured question with citations.
4. Token mode refreshes before the initial token expires.
5. A second user cannot retrieve content that the first user is not authorized to
   see.

The containers intentionally use explicit dimensions and a visible stacking
context. Keep those layout constraints when moving the widgets into your own app.
