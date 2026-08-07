---
name: incident-copilot
description: 'Triage an incident from your own runbooks and past incidents, propose one pre-registered action, and let a human approve it — where the gate refuses the wrong person, expiry escalates instead of auto-approving, and every attempt is audited.'
disable-model-invocation: true
---

## Before you start

- A Glean instance with engineering content indexed — a service catalog, runbooks, and at least one past incident review
- A work email for tenant discovery and OAuth sign-in; a scoped API token is the fallback
- X_GLEAN_INCLUDE_EXPERIMENTAL=true (the Platform API is Experimental as of its 2026-07 launch)
- Node 20+

Build "On-call copilot with a real approval gate" following https://developers.glean.com/cookbook/incident-copilot

Ask these before running commands. Ask one at a time, waiting for each
answer before asking the next — do not put them all in one message:

- Do you want the instant fixture demo or a live tenant run?
- For a live run, which service has a catalog entry, runbook, and past incident in Glean?
- For a live run, use direct Search + Chat or an existing Glean agent?
- For a live run, what is your work email?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/incident-copilot incident-copilot
   ```

2. **Install dependencies**

   ```bash
   cd incident-copilot && npm install
   ```

3. **Watch the governance hold, with no credentials**
   Replays recorded responses and asserts the parts that matter: the gate refuses the wrong actor, expiry escalates without executing, an unregistered action is refused, a mutating action with no supported cause is downgraded, and every attempt is audited.

   ```bash
   cd incident-copilot && npm run verify:fixture
   ```

4. **Set credentials**
   Only for a live run. Use npm run login for direct Search + Chat, or npm run login:agent when the user selected an existing Glean agent. Set WATCHED_SERVICES to the service already supplied and GLEAN_AGENT_ID only for the agent path.

   ```bash
   cd incident-copilot && npm run login -- --email "<work-email>"
   ```

5. **Run it**

   ```bash
   cd incident-copilot && npm start
   ```

6. **Verify**
   Fire the sample alarm and check three things: the probable cause cites a past incident rather than a runbook, approving as someone who is not on call returns 403, and forcing expiry escalates without executing anything.
