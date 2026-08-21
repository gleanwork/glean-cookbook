---
name: oncall-copilot
description: 'An on-call dashboard that takes an alarm to a proposed action and puts a person in front of that action. It names a cause only when a past incident backs it, turns away an approver who is neither on call nor the service owner, and escalates instead of approving itself when nobody answers. It runs on recorded incidents, so you can watch it refuse things before connecting it to anything.'
disable-model-invocation: true
---

## Before you start

- Node 20 or newer
- Nothing else. The walkthrough replays recorded Glean responses, so it needs no credentials and makes no network calls
- Only if you later point it at your own instance: an indexed service catalog, runbooks, and incident reviews, plus a work email for sign-in or a Glean API token with the SEARCH and CHAT scopes. The agent planner also needs the AGENTS scope and a conversational agent ID. Plan on editing the catalog query and parser first, since they read the sample corpus's layout

Build "On-call Copilot" following https://developers.glean.com/cookbook/oncall-copilot

1. **Copy the project onto your machine**
   Creates an oncall-copilot folder in whatever directory you are in, holding the server, the dashboard, and the recorded incidents. Stay in that same directory for the rest of the steps, since each command changes into the folder itself.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/oncall-copilot oncall-copilot
   ```

2. **Install dependencies**
   Installs the few packages the TypeScript server needs. Everything runs on your machine, and nothing is deployed anywhere.

   ```bash
   cd oncall-copilot && npm install
   ```

3. **See what it refuses before connecting anything**
   Runs the unit tests, then replays the recorded incidents through the whole flow and checks the refusals: the gate turns away an actor who is neither on call nor the service owner, an unapproved proposal escalates without executing, an action the planner invented is refused, and a code-changing action with no supported cause drops to filing a ticket. The audit log records each of those decisions. The command reads no credentials and makes no network calls.

   ```bash
   cd oncall-copilot && npm run verify:fixture
   ```

4. **Open the dashboard**
   Starts the local server and prints a Local URL. Open that URL in a browser. The dashboard replays the same recorded Glean responses, so there is nothing to sign in to.

   ```bash
   cd oncall-copilot && npm start
   ```

   Keep the server running. Capture the exact Local URL it prints and report it as a clickable Markdown
   link. Ask the user to click the link in their normal browser and confirm the page is ready. Then give
   the first verification action.

5. **Fire the three alarms**
   Fire canary alarm · PAY-2231 shows a probable cause with the past incident it rests on. No-precedent alarm · PAY-2232 shows the copilot declining to name a cause and dropping the proposed fix to a ticket. Off-script agent · PAY-2233 shows an unregistered action refused before any approval card appears. Click PAY-2231 or PAY-2232 in the queue so an approval card is on screen again, then choose not.on.call@sample.example.com under Acting as and approve to get an audited 403. Click Force expiry → escalate on that same incident to watch a proposal hand off without executing.
