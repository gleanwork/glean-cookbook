---
name: embed-search-chat
description: 'Put permission-aware Glean search and chat directly inside an internal app with the Web SDK, so your team gets answers where they already work.'
disable-model-invocation: true
---

## Before you start

- A Glean instance with content indexed
- Your Glean Web app URL from Admin > About Glean > Web app URL
- A frontend app or page where you can install @gleanwork/web-sdk@2.4.0 and add sized container elements
- For the React variant: Node 20.19+ or 22.12+ and a signed-in Glean browser session

Build "Embed search & chat in an internal app" following https://developers.glean.com/cookbook/embed-search-chat

### React

Runnable React example with Search Box, Search Results, and Chat

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant; if you already know the backend, you can configure it directly instead.
- What topic do you know exists in your Glean content?

{{> browser-cookie-setup}}

{{> step-shell}}

1. **Copy the React example onto your machine**
   Creates an embed-search-chat folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/embed-search-chat/react embed-search-chat
   ```

2. **Install dependencies**
   Installs the pinned Glean Web SDK, React, and Vite dependencies.

   ```bash
   cd embed-search-chat && npm install
   ```

3. **Find your Glean backend**
   Uses your email once to find the tenant backend and writes VITE_GLEAN_BACKEND to .env.local. If the backend is already known, set that variable manually instead. This is setup-time configuration, not a runtime tenant picker, and it does not request or store an API key.

   ```bash
   npm run configure -- --email "<work-email>"
   ```

4. **Configure the Web app URL and questions**
   Open `.env.local`. Set `VITE_GLEAN_WEB_APP_URL` to the **Web app URL** row in Glean Admin > About Glean, such as `https://app.glean.com`. It is a different value from the backend the previous step wrote, which ends in `-be.glean.com`. Set `VITE_GLEAN_INITIAL_QUERY` and `VITE_GLEAN_INITIAL_MESSAGE` to topics you know your Glean content covers. Both URLs are deployment configuration, not values users enter at runtime.

5. **Open the page**
   Starts Vite and prints a Local URL. Open that URL in a browser where the user is signed in to Glean.

   ```bash
   npm run dev
   ```

   {{> run-local-web-cookie}}

6. **Verify search, chat, and the user boundary**
   Confirm autocomplete appears above Search Results, a known query returns accessible content with citations, and Chat answers the configured question. Repeat the check with a second authorized user and confirm neither Search nor Chat reveals content that user cannot access. If a vanity SSO hostname redirects an embedded frame to app.glean.com, confirm the exact Web app URL in Admin > About Glean; never proxy or frame the full app.

## Setup

- Scaffold web SDK embed

## Language

Ask me which language to build in before starting: TypeScript, JavaScript.
