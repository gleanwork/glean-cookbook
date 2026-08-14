---
name: customer-360
description: 'One page per account — status, risks, and a drill-in chat — assembled from whatever your instance already knows about that customer. No CRM export, no separate index.'
disable-model-invocation: true
---

## Before you start

- A work email for tenant discovery and OAuth sign-in; a scoped Glean API token is the fallback
- X_GLEAN_INCLUDE_EXPERIMENTAL=true for Platform Search and Agents
- Path B: an Account Brief agent in Agent Builder; set GLEAN_AGENT_ID server-side
- Node 20+
- An account name your own content covers — the page is built around whichever you pick (GLEAN_ACCOUNT_NAME)

Build "Customer 360: an account page built from your own content" following https://developers.glean.com/cookbook/customer-360

1. **Pick a path**
   Path A combines parallel Platform Search tiles with Client Chat synthesis. Path B keeps the same page UX but uses a template Account Brief agent.

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
- Which account should the page use?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-search-chat customer-360
   ```

2. **Install dependencies**

   ```bash
   cd customer-360 && npm install
   ```

3. **Try it with no credentials**
   Runs the Globex account tiles and Client Chat path against recorded Sample Corp responses. Overview counts must match the fixture result lengths, and the three demo queries must stay cited.

   ```bash
   cd customer-360 && npm run verify:fixture
   ```

4. **Set credentials**
   The shipped command discovers the tenant and completes OAuth, with a scoped API token fallback. Set GLEAN_ACCOUNT_NAME in the resulting ignored .env to the account the user supplied. Do not search for a different account.

   ```bash
   cd customer-360 && npm run login -- --email "<work-email>"
   ```

5. **Verify**
   Allow 1–3 minutes. It starts its own server, runs the demo queries against the supplied account, and asserts cited answers plus deterministic evidence coverage.

   ```bash
   cd customer-360 && npm run verify
   ```

6. **Run it**
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
- Which account should the page use?
- What is the ID of your Account Brief agent?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/customer-360/platform-agents customer-360
   ```

2. **Install dependencies**

   ```bash
   cd customer-360 && npm install
   ```

3. **Set credentials**
   The shipped command discovers the tenant and completes OAuth, with a scoped API token fallback. Set GLEAN_ACCOUNT_NAME and GLEAN_AGENT_ID in the resulting ignored .env from the answers already supplied.

   ```bash
   cd customer-360 && npm run login -- --email "<work-email>"
   ```

4. **Verify**
   Allow 1–3 minutes. It starts its own server and verifies the supplied account and Account Brief agent before the app is left running.

   ```bash
   cd customer-360 && npm run verify
   ```

5. **Run it**
   ```bash
   cd customer-360 && npm start
   ```
   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.
