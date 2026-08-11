---
name: oncall-copilot
description: 'Triage an incident from your own runbooks and past incidents, propose one pre-registered action, and let a human approve it — where the gate refuses the wrong person, expiry escalates instead of auto-approving, and every attempt is audited.'
disable-model-invocation: true
---

## Before you start

- For configured runs: a Glean instance with engineering content indexed — a service catalog, runbooks, and at least one past incident review
- For configured runs: a work email for tenant discovery and OAuth sign-in; a scoped API token is the fallback
- For configured runs: X_GLEAN_INCLUDE_EXPERIMENTAL=true (the Platform API is Experimental as of its 2026-07 launch)
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

Ask these before running commands. Ask one at a time, waiting for each
answer before asking the next — do not put them all in one message:

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

4. **Set credentials**
   Only for a live run. Use npm run login for direct Search + Chat, or npm run login:agent when the user selected an existing Glean agent. Set WATCHED_SERVICES to the service already supplied and GLEAN_AGENT_ID only for the agent path.

   ```bash
   cd oncall-copilot && npm run login -- --email "<work-email>"
   ```

5. **Run it**

   ```bash
   cd oncall-copilot && npm start
   ```

   Report [http://localhost:3000](http://localhost:3000) as a clickable link, using the exact printed URL if different.
   Keep the server running. Ask the user to click the link in their normal browser and confirm the page
   is ready. Then give the first verification action.

6. **Verify**
   Fire the sample alarm and check three things: the probable cause cites a past incident rather than a runbook, approving as someone who is not on call returns 403, and forcing expiry escalates without executing anything.
