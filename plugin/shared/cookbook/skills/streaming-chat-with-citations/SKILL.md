---
name: streaming-chat-with-citations
description: "Use the modern Platform Chat API to send a permission-aware question, continue the conversation, and read server-sent events with the official TypeScript API client's createStream EventStream."
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer. The steps use npx and npm. Install Node from https://nodejs.org if needed.
- A Glean instance with content indexed
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that permits the public OAuth client and chat scope through DCR

Build "Stream a cited Chat response" following https://developers.glean.com/cookbook/streaming-chat-with-citations

{{> ask-setup-questions}}

- What is your work email address?
- What question do you want to ask about content in your Glean instance?
- What follow-up question should use the same conversation?

{{> oauth-setup}}

1. **Scaffold the project**
   Copies the runnable TypeScript Chat CLI and fixture tests into a new directory. OAuth login and secure token storage come from the pinned @gleanwork/auth package.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/streaming-chat-with-citations streaming-chat-with-citations
   ```

2. **Install dependencies**

   ```bash
   cd streaming-chat-with-citations && npm install
   ```

3. **Run the fixture tests**
   Runs Vitest with MSW-backed fixtures, without credentials or live network access, covering typed createStream events, conversation_id propagation, and citations.

   ```bash
   cd streaming-chat-with-citations && npm test
   ```

4. **Sign in with OAuth**
   Discovers your Glean backend from work email and completes Authorization Code with PKCE for Chat and offline_access. Use --server-url for an explicit backend. If DCR is restricted, set GLEAN_OAUTH_CLIENT_ID for an administrator-provisioned public client. If OAuth is not available, set GLEAN_API_TOKEN later as a user-scoped fallback.

   ```bash
   cd streaming-chat-with-citations && npm run login -- --email "<work-email>"
   ```

5. **Stream one Chat turn**
   Sends a question through createStream, then prints delta text, conversation_id, and grounded citation data against your own instance.

   ```bash
   cd streaming-chat-with-citations && npm run verify -- --email "<work-email>" --prompt "<chat-question>"
   ```

6. **Stream a follow-up**
   Starts a stored conversation, iterates createStream events, and sends a follow-up using the returned conversation_id.
   ```bash
   cd streaming-chat-with-citations && npm start -- --email "<work-email>" --prompt "<chat-question>" --follow-up "<follow-up-question>"
   ```
   {{> run-cli}}
