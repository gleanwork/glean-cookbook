---
name: triage-support-issue
description: 'Give a published support-triage Agent one issue URL or description and get an evidence-backed summary, next diagnostic step, and customer-safe response.'
disable-model-invocation: true
---

## Before you start

- Node 22.12 or newer
- A published conversational Agent configured to triage support issues using the user's permitted Glean content
- The Agent ID from Agent Builder or the Agents Platform API
- A work email for tenant discovery and OAuth sign-in, or a token able to run the selected Agent

Build "Triage one support issue with a Glean Agent" following https://developers.glean.com/cookbook/triage-support-issue

Use nonsecret inputs the user already supplied. Ask only for missing information needed by the
selected recipe path, resolving dependent choices before continuing. Do not request credential
values in conversation; use the recipe's documented secure sign-in or secret-entry path. Required
questions for this recipe are:

- What is your work email? It is used once to discover your Glean tenant.
- What is the ID of the published conversational support-triage Agent to run?
- What support issue should the Agent triage? Paste a ticket URL or a concise issue description.

Follow the selected authentication path. If OAuth is selected, run the recipe's shipped login
command with its declared scopes. If the documented token path is selected, skip OAuth login
and use that path's declared secure configuration. Keep sign-in and secret entry user-controlled.
Do not implement or alter OAuth while setting up the recipe, and do not silently substitute a
path when the documented one fails.

1. **Scaffold the recipe**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/triage-support-issue triage-support-issue
   ```

2. **Install dependencies**
   Installs dotenv. The recipe uses Node's built-in fetch against the Platform Agents API, not A2A or the legacy REST API.

   ```bash
   cd triage-support-issue && npm install
   ```

3. **Sign in to Glean**
   Use @gleanwork/auth for tenant discovery and refreshable OAuth credentials stored outside the project. If OAuth is unavailable, provide a user-scoped token that can run the selected Agent.

   ```bash
   cd triage-support-issue && npm run login -- --email "<work-email>"
   ```

4. **Set the Agent and issue**
   Set GLEAN_AGENT_ID to a published conversational support-triage Agent. Then pass one ticket URL or issue description to the triage command. A form-triggered Agent is outside this quickstart because it requires a different input contract.

5. **Run the triage**
   The command makes one Platform Agent run and prints the structured triage. It does not make any external write or customer-facing update.

   ```bash
   cd triage-support-issue && npm run triage -- "<support-issue>"
   ```

   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.

6. **Verify the response**
   Run the no-credential fixture check first. For a live check, set GLEAN_SUPPORT_ISSUE and run npm run verify; confirm the Agent separates evidence from hypotheses.
   ```bash
   cd triage-support-issue && npm run verify:fixture
   ```
