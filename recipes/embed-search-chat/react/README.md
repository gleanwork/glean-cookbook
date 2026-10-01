# Embed Search & Chat with React

This is a standalone React/Vite example for embedding Glean Search and Chat in an
internal application. It uses the signed-in Glean browser session through the
Web SDK's SSO flow. The browser does not receive an API key or other secret.

## Requirements

- Node 20.19+ or 22.12+
- A Glean instance with content indexed
- A Glean Web app URL from Admin → About Glean → Web app URL
- A signed-in Glean browser session

## Setup

```bash
npm install
cp .env.example .env.local
npm run configure -- --email "you@company.com"
```

`npm run configure` writes `VITE_GLEAN_BACKEND` into `.env.local` by resolving
the tenant from the supplied work email. If you already know the backend, you
can enter it directly instead. Set `VITE_GLEAN_WEB_APP_URL` to the exact value
in Glean Admin → About Glean → Web app URL.

The backend and Web app URL are setup-time/deployment configuration. The app
never asks browser users to choose a tenant or provide runtime credentials.

## Run

```bash
npm run dev
```

Open the exact local URL printed by Vite in a browser where the user is already
signed in to Glean.

Verify that:

1. Search autocomplete appears above the results container.
2. A query returns results from content the signed-in user can access.
3. Search results include citations or source links.
4. Chat renders and answers the configured question with citations.
5. A second user cannot retrieve content that the first user is not authorized to
   see.

If a vanity tenant hostname redirects an embedded `/frame/*` request to
`app.glean.com`, confirm the exact Web app URL in Admin → About Glean. For this
tenant, `https://app.glean.com` renders the embedded Search and Chat frames and
is the working local value. Do not use the backend hostname or proxy the full
app.

The containers intentionally use explicit dimensions and a visible stacking
context. Keep those layout constraints when moving the widgets into your own app.
