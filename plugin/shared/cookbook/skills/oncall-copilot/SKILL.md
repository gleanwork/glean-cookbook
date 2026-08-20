---
name: oncall-copilot
description: 'Triage an incident from your own runbooks and past incidents, propose one pre-registered action, and let a human approve it — where the gate refuses the wrong person, expiry escalates instead of auto-approving, and every attempt is audited.'
disable-model-invocation: true
---

## Before you start

- For configured runs: a Glean instance with engineering content indexed — a service catalog, runbooks, and at least one past incident review
- For configured runs: a work email for tenant discovery and OAuth sign-in; a scoped API token is the fallback
- Node 20+

Build "On-call Copilot" following https://developers.glean.com/cookbook/oncall-copilot

{{> demo-mode}}

{{> ask-setup-questions}}

- Which service has a catalog entry, runbook, and past incident in Glean?
- Should the Glean-agent planner be enabled as well, or just direct Search + Chat? Both render into the same dashboard.
- What is your work email?

{{> oauth-setup}}

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/oncall-copilot oncall-copilot
   ```

2. **Install dependencies**

   ```bash
   cd oncall-copilot && npm install
   ```

3. **See it work before you connect anything**
   Runs the whole flow against recorded responses. It checks that the approval gate refuses the wrong actor, expiry escalates without executing, unregistered actions are refused, and every attempt is audited. This needs no Glean credentials.

   ```bash
   cd oncall-copilot && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the SEARCH and CHAT scopes.

   ```bash
   cd oncall-copilot && npm run login -- --email "<work-email>"
   ```

5. **Name the service this copilot watches**
   Signing in does not pick a service for you. Open .env and set WATCHED_SERVICES to the catalog name of the service you named up front. If you watch more than one, use a comma-separated list.

6. **Optional: let a Glean agent do the planning**
   The app ships with two planners and a dropdown to switch between them. Search and Chat works with the token you already have. The Glean agent planner stays greyed out until you point the app at an agent. To turn it on, run this command so your token also carries the AGENTS scope, then set GLEAN_AGENT_ID in .env to that agent's ID.

   ```bash
   cd oncall-copilot && npm run login:agent -- --email "<work-email>"
   ```

7. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.

   ```bash
   cd oncall-copilot && npm start
   ```

   {{> run-local-web}}

8. **Check it against your own content**
   Fire an alarm for the service you named. Check that a probable cause cites a past incident from your own corpus rather than a runbook, that approving as someone who is not on call returns 403, and that forcing expiry escalates without executing anything.
