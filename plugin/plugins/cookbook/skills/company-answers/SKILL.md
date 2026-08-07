---
name: company-answers
description: 'The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.'
disable-model-invocation: true
---

## Before you start

- A Glean instance with content indexed
- For the Web SDK path: an existing Glean session in your normal browser
- Node 20.19+ or 22.12+

Build "Company Answers: a cited Q&A page on your own content" following https://developers.glean.com/cookbook/company-answers

1. **Pick a path**
   Path A (Web SDK) renders Glean's own chat UI for you — fastest to stand up, no backend code. Path B (Chat API) calls the Chat API directly from your own backend — you own every pixel of the UI and the request/response shape. Both reach the same place: a permission-aware, cited answer.

### Web SDK

Web SDK variant — renderChat in a page

Ask these before running commands:

- What is your work email? It is used once to discover your Glean tenant.
- What topic do you know exists in your Glean content?

Cookie SSO requires the user's normal signed-in browser. Never open or automate the app yourself.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/company-answers/web-sdk company-answers
   ```

2. **Install dependencies**

   ```bash
   cd company-answers && npm install
   ```

3. **Configure the tenant**
   Enter the user's work email when prompted. The shipped discovery command writes VITE_GLEAN_BACKEND to .env.local. Set VITE_GLEAN_INITIAL_MESSAGE to the topic they supplied.

   ```bash
   cd company-answers && npm run configure -- --email "<work-email>"
   ```

4. **Run it**
   Keep Vite running, report its exact Local URL, and wait for the user to open it in their normal signed-in browser. Never open or automate the URL yourself.

   ```bash
   cd company-answers && npm run dev
   ```

5. **Verify**
   Give the user the exact printed local URL to open in their normal signed-in browser. Ask them to try a topic they know exists in their Glean instance and confirm a real, cited answer renders inside Glean's chat UI.

### Chat API

Chat API variant — one chat.create call, citations rendered

Ask these before running commands:

- What is your work email? It is used once to discover your Glean tenant.
- What topic do you know exists in your Glean content?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/company-answers/chat-api company-answers
   ```

2. **Install dependencies**

   ```bash
   cd company-answers && npm install
   ```

3. **Set credentials**
   The shipped command discovers the tenant from the user's work email, signs them in with OAuth, and writes the backend plus short-lived access token to ignored .env. Set GLEAN_DEMO_QUERY to the supplied topic. If tenant OAuth is unavailable, enter a CHAT-scoped API token as the fallback.

   ```bash
   cd company-answers && npm run login -- --email "<work-email>"
   ```

4. **Verify**
   Takes about 1–3 minutes. It starts its own server and checks the configured topic for a non-empty answer with deduplicated citations.

   ```bash
   cd company-answers && npm run verify
   ```

5. **Run it**
   Leave the verified app running at http://localhost:3000 and give that URL to the user.
   ```bash
   cd company-answers && npm start
   ```
