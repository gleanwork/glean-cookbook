# company-answers / web-sdk

Path A of the [Company Answers](../../../docs/cookbook/company-answers.mdx) recipe — Glean owns the UI. One `renderChat` call, no backend code.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. You'll see a login prompt (SSO) unless you're already signed into your Glean instance in the browser — that's the SDK's default `authMethod: 'sso'`, requiring zero configuration on your part.

## What this does

`src/main.ts` calls `renderChat(container, {})` from `@gleanwork/web-sdk`. That's the entire integration — Glean renders and owns the full chat UI inside `#chat`. See `package.json` for the pinned SDK version this was verified against.

To point at your own instance instead of asking users for their email, pass `backend: 'https://{your}-be.glean.com'` (commented out in `src/main.ts`).

## Contrast with Path B (chat-api/)

This path ships Glean's full chat UI for free — fastest to stand up, but you don't control the UI. See `../chat-api/` for the alternative: you own the UI and call the Chat API directly.
