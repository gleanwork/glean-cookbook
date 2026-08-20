---
name: oncall-copilot
description: 'An incident copilot that triages from your own runbooks and past incidents, proposes one action, and will not run it without an authorized approver.'
disable-model-invocation: true
---

## Before you start

- Node 20 or newer
- Your work email, so the sign-in command can find your Glean tenant. If your tenant cannot use OAuth, you need a Glean API token instead, scoped to SEARCH and CHAT, plus AGENTS if you want a Glean agent to plan the triage
- Content in Glean about the service you want triaged. The alarm buttons on the dashboard fire a service named payments-service, so you need a catalog page for that name, filed under /services/, whose text says who the tech lead is and who is on call this week
- Runbooks filed under /runbooks/ and past incident reviews filed under /incidents/ for that same service. The copilot decides what a document is allowed to support from those paths: a runbook can justify a procedure, and only a past incident can justify a cause

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

- The alarm buttons fire a service named payments-service. Does your Glean content cover it with a catalog page, a runbook, and at least one past incident review?
- Should the app plan the triage itself, or should one of your Glean agents plan it?
- What is your work email?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Copy the project onto your machine**
   Creates an oncall-copilot folder in whatever directory you run this from. Every command after this one runs inside that folder. Inside it you get the webhook that receives alarms, the triage logic, the approval gate, and the dashboard you watch it all from.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/oncall-copilot oncall-copilot
   ```

2. **Install dependencies**
   Installs the Glean API client and the small local server that runs the dashboard and receives alarms.

   ```bash
   cd oncall-copilot && npm install
   ```

3. **See what it refuses before you connect anything**
   Runs the whole flow against recorded answers for a made-up service called payments-service, so you can watch the safety rules work before you connect anything. This needs no Glean credentials and makes no network calls. Four refusals go past: someone who is not on call is turned away, a proposal nobody approved in time escalates instead of running, an action the copilot made up is rejected, and a proposed code change with no past incident behind it is downgraded to filing a ticket. If you would rather go straight to your own content, skip this.

   ```bash
   cd oncall-copilot && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Your email is used once to find which Glean tenant you belong to, then a browser window opens for you to approve access. The command creates the .env file for you and fills in GLEAN_SERVER_URL and GLEAN_API_TOKEN. If your tenant has not enabled OAuth, skip this command and do it by hand instead: copy .env.example to .env, then fill in your Glean instance URL and a Glean API token that has the SEARCH and CHAT scopes.

   ```bash
   cd oncall-copilot && npm run login -- --email "<work-email>"
   ```

5. **Make sure Glean covers the service**
   Both alarm buttons on the dashboard fire a service named payments-service, and the webhook ignores alarms for anything else, so this is the one name your content has to cover. Triage reads the owner and the on-call engineer off a catalog page for that name, and stops if it cannot find one. If you want one of your Glean agents to plan the triage instead of the app doing it, open .env and set GLEAN_AGENT_ID to that agent's ID. Leave it blank and the app plans the triage itself and says so on the page.

6. **Open the dashboard**
   Starts the server and prints a Local URL. Open that URL in your browser. The page starts empty, because nothing happens until you fire an alarm.

   ```bash
   cd oncall-copilot && npm start
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.

7. **Watch it triage, and watch it stop**
   Click Fire canary alarm · PAY-2231. The card that appears should name the on-call engineer and the owner it read from your own catalog, then wait for your approval instead of acting on its own. Click Force expiry → escalate to see what happens when nobody approves in time: the proposal goes to the escalation target and nothing runs. To watch the gate turn you away, open .env, set INCIDENT_ACTOR to anyone who is not on call for that service, restart, and fire the alarm again. The card now tells you who is allowed to approve and leaves the buttons disabled.
