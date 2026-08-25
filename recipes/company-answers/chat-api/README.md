# Company Answers - Chat API

Path B of the [Company Answers](https://developers.glean.com/cookbook/company-answers) recipe. You own the UI. The server owns the API token.

## See it work before you connect anything

```bash
npm install
npm run verify:fixture
```

That run uses recorded answers for a fictional company named Acme. It needs no Glean credentials.

## Sign in, then check your own content

```bash
npm run login
```

`npm run login` finds your Glean tenant from your work email, opens a browser for you to approve access, and writes `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN` into a new `.env`. If your tenant cannot use OAuth, skip that command: copy `.env.example` to `.env` and fill in those two values yourself, using a Glean API token that carries the **CHAT** scope.

Signing in does not pick a topic. Open `.env` and set `GLEAN_DEMO_QUERY` to a question about your own content.

```bash
npm run verify
npm start
```

Open the Local URL printed by the server.

## What this does

`server.ts` is a small Node HTTP server. `GET /` serves the page. `POST /api/ask` calls the Chat API through `glean.chat.create` with `stream:false`, `store:false`, and `X_GLEAN_INCLUDE_EXPERIMENTAL=true`. It then extracts:

- **answer text** from ASSISTANT `OUTPUT_TEXT` content
- **citations** from `annotations[].sources`, kept when they have a title, deduped by URL

The API token never reaches the browser.

## Contrast with Path A (`../web-sdk/`)

Here you own every pixel of the UI and the request shape. The Web SDK path ships Glean's full chat UI and uses the viewer's browser session instead of a server token.
