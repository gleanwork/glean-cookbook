---
name: customer-360
description: 'One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.'
disable-model-invocation: true
---

## Before you start

- Node 20 or newer
- Your work email, so the sign-in command can find your Glean tenant. If your tenant cannot use OAuth, you need a Glean API token instead, scoped to the path you pick
- The name of one of your own customers, spelled the way it appears in your Glean documents. You put that name in GLEAN_ACCOUNT_NAME, and the page is built around it. This is the customer you are reading about, not your own company or your Glean instance
- Path B only: a conversational Account Brief agent in Agent Builder, whose ID you put in GLEAN_AGENT_ID. A form-triggered agent will not work

Build "Customer 360: an account page built from your own content" following https://developers.glean.com/cookbook/customer-360

1. **Pick a path**
   Both paths build the same page from the same content, and each has its own set of steps. Choose Platform Search Chat if you want the page to assemble the account itself, which is the better starting point. Choose Platform Agents if you already run an Account Brief agent and want the page to show what that agent says.

Ask which variant to build first, on its own, and wait for the answer. Then follow only that variant
below, asking its questions one at a time.

### Platform Search Chat

Path A — parallel Platform Search tiles + Client Chat synthesis

### Select the run mode

Before asking setup questions, silently check whether `GLEAN_COOKBOOK_DEMO` is exactly `true`; do
not print the environment or the variable value.

- When it is `true`, use the bundled sample-data path: skip all setup questions, authentication,
  and fixture verification output; after scaffolding and installing, run `npm run demo` and follow
  the standard browser handoff.
- Otherwise, never mention or offer demo, sample, or fixture mode. Skip the fixture-only step and
  follow the normal configured run, including its setup questions, authentication, and live
  verification.

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- Which of your customers should this page be about? Use the name the way your Glean documents spell it, not your own company or Glean instance name.

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Copy the project onto your machine**
   Creates a customer-360 folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-search-chat customer-360
   ```

2. **Install dependencies**
   Installs the Glean API client and the small local server that serves the page.

   ```bash
   cd customer-360 && npm install
   ```

3. **See it work before you connect anything**
   Runs the whole page against recorded answers for a fictional account named Globex, so you can see what it produces before you connect anything. This needs no Glean credentials.

   ```bash
   cd customer-360 && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the SEARCH and CHAT scopes.

   ```bash
   cd customer-360 && npm run login -- --email "<work-email>"
   ```

5. **Choose which customer the page is about**
   Signing in does not pick an account for you, so open .env and set GLEAN_ACCOUNT_NAME to one of your own customers, for example Acme Logistics. Spell it the way your Glean documents spell it, because the page searches your content for that exact name and builds the whole page from what it finds.

6. **Check it against your own content**
   Takes 1 to 3 minutes. It starts its own server, asks your Glean instance the three demo questions about the account you chose, and fails if any answer comes back without citing a real document.

   ```bash
   cd customer-360 && npm run verify
   ```

7. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.
   ```bash
   cd customer-360 && npm start
   ```
   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.

### Platform Agents

Path B — Platform Agents createRun for prescriptive account briefs

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- Which of your customers should this page be about? Use the name the way your Glean documents spell it, not your own company or Glean instance name.
- What is the ID of your Account Brief agent? It must be a conversational agent, not a form-triggered one.

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Build the Account Brief agent**
   In Agent Builder, create a conversational agent that writes an account brief, and copy its ID from the browser URL. It must be conversational, because this page sends it a question and reads the reply. A form-triggered agent will not work here.

2. **Copy the project onto your machine**
   Creates a customer-360 folder in whatever directory you run this from. Every command after this one runs inside that folder.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-agents customer-360
   ```

3. **Install dependencies**
   Installs the Glean API client and the small local server that serves the page.

   ```bash
   cd customer-360 && npm install
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the SEARCH and AGENTS scopes.

   ```bash
   cd customer-360 && npm run login -- --email "<work-email>"
   ```

5. **Choose the customer and point at your agent**
   Signing in does not pick an account for you, so open .env and set two values. GLEAN_ACCOUNT_NAME is one of your own customers, for example Acme Logistics, spelled the way your Glean documents spell it. GLEAN_AGENT_ID is the ID of the Account Brief agent you created in Agent Builder.

6. **Check it against your own content**
   Takes 1 to 3 minutes. It starts its own server, confirms your agent answers for the account you chose, and fails if the brief comes back without citing a real document.

   ```bash
   cd customer-360 && npm run verify
   ```

7. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.
   ```bash
   cd customer-360 && npm start
   ```
   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.
