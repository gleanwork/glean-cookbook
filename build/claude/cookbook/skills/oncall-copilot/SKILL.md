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

- Which service has a catalog entry, runbook, and past incident in Glean?
- Use direct Search + Chat or an existing Glean agent?
- What is your work email?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/oncall-copilot oncall-copilot
   ```

2. **Install dependencies**

   ```bash
   cd oncall-copilot && npm install
   ```

3. **Watch the governance hold, with no credentials**
   Replays recorded responses and asserts the parts that matter: the gate refuses the wrong actor, expiry escalates without executing, an unregistered action is refused, a mutating action with no supported cause is downgraded, and every attempt is audited.

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

6. **Point at an existing Glean agent, if you chose that path**
   Skip this step if you are using Search and Chat directly. If an existing Glean agent should own the plan, run login:agent so the token also has the AGENTS scope, then set GLEAN_AGENT_ID in .env to that agent's ID.

   ```bash
   cd oncall-copilot && npm run login:agent -- --email "<work-email>"
   ```

7. **Open the page**
   Starts the server and prints a Local URL. Open that URL in your browser.

   ```bash
   cd oncall-copilot && npm start
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.

8. **Check it against your own content**
   Fire an alarm for the service you named. Check that a probable cause cites a past incident from your own corpus rather than a runbook, that approving as someone who is not on call returns 403, and that forcing expiry escalates without executing anything.
