# company-answers / web-sdk

Path A of the [Company Answers](https://developers.glean.com/cookbook/company-answers) recipe — Glean owns the UI. One `renderChat` call, no backend code.

## Configure

```bash
npm install
cp .env.example .env.local
```

Set `VITE_GLEAN_BACKEND` to your tenant's HTTPS backend origin, such as
`https://example-be.glean.com`. Optionally set `VITE_GLEAN_INITIAL_MESSAGE` to a question about
content you know exists in your tenant.

## Run

```bash
npm run dev
```

Copy the exact local URL printed by Vite and open it yourself in your normal browser where you are
already signed in to Glean. Do not use a private/incognito window or an agent-controlled browser;
those browsers do not share your Glean SSO session.

## What this does

`src/main.ts` calls `renderChat` from `@gleanwork/web-sdk` with your explicit backend. Glean renders
and owns the full chat UI inside `#chat`, using the viewer's existing Glean browser session.

## Contrast with Path B (chat-api/)

This path ships Glean's full chat UI for free — fastest to stand up, but you don't control the UI. See `../chat-api/` for the alternative: you own the UI and call the Chat API directly.
