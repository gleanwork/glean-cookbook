---
name: human-in-the-loop-agent
description: 'Start a durable agent run from TypeScript, see the exact tool call it wants to make, and approve or reject it before it happens. The agent only sends you a Slack DM.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12+ and npm
- A Glean instance with durable agent runs available
- Permission to create agents in Agent Builder
- Slack tools enabled for agents by a Glean admin, and your Slack account connected in Glean, so the agent can send you a direct message
- Permission to sign in with the agents scope

Build "Approve an agent action from a CLI" following https://developers.glean.com/cookbook/human-in-the-loop-agent

Use nonsecret inputs the user already supplied. Ask only for missing information needed by the
selected recipe path, resolving dependent choices before continuing. Do not request credential
values in conversation; use the recipe's documented secure sign-in or secret-entry path. Required
questions for this recipe are:

- What is your work email? It finds your Glean instance and signs you in.
- After you save the agent in Agent Builder, what is its agent ID (the 32-character ID after /agents/ in its URL)?

Follow the selected authentication path. If OAuth is selected, run the recipe's shipped login
command with its declared scopes. If the documented token path is selected, skip OAuth login
and use that path's declared secure configuration. Keep sign-in and secret entry user-controlled.
Do not implement or alter OAuth while setting up the recipe, and do not silently substitute a
path when the documented one fails.

1. **Copy the project**

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/human-in-the-loop-agent human-in-the-loop-agent
   ```

2. **Install and run the offline tests**
   Run every later command from this directory in the same shell. The tests run the real SDK against local HTTP handlers; they don't sign in or contact Glean or Slack.

   ```bash
   cd human-in-the-loop-agent && npm ci
   npm test
   ```

3. **Create the agent in Agent Builder**
   In Glean, open the Agent library and click Create agent; Auto mode is selected by default. Builder Assistant opens next to the configuration tabs; you don't need it here (if it asks you to describe the agent first, paste the instructions into it, then check each tab). Name the agent Cookbook approval demo. In the Instructions tab, replace any text with the instructions this command prints. In the Tools tab, add Slack and no other app; if Slack lists its tools, keep only the direct message tool (Send message as DM in Glean's Slack tools docs, Send Slack message to user in runs). Leave Run without user confirmation unchecked; new tools start unchecked. That setting is the approval boundary. In the Triggers tab, use Manual run with Chat message input, then click Save; until you save, edits are only a draft. Copy the agent ID from the page URL: the 32-character ID after /agents/.

   A spec file can't do this step portably: it refers to Slack by a tool provider ID that is different on every Glean instance, so the Slack tool would be silently dropped on yours.

   ```bash
   cat agent-instructions.txt
   ```

4. **Sign in**
   Complete browser sign-in yourself. glean-auth finds your Glean backend from your email and keeps a refreshable session outside this project, so a run can wait for you. If OAuth isn't available, copy .env.example to .env and set GLEAN_API_TOKEN to a user-scoped token with the agents scope instead. Never paste a token into a chat or a command.

   ```bash
   npm run login -- --email "<work-email>"
   ```

5. **Run the agent and decide**
   The command starts one durable run, waits for the agent to pause, and shows the tool, what it does, and its exact arguments. Type a to approve that one call (the DM arrives), r to reject it (nothing is sent), c to cancel the run, or press Enter to leave it waiting. --show-json also prints each run Glean returns as JSON, under the SDK call that returned it, so you can see the API responses; leave it off to see only the review. The JSON includes the tool arguments, so keep it out of shared logs. If the run finishes without asking, the tool isn't added, Run without user confirmation is checked, or the agent wasn't saved. Closing the CLI or reaching the 120-second wait doesn't cancel the run; the CLI prints the full resume command, with the agent and run IDs, to continue. A resumed run can take a few minutes to finish after a decision; if the wait runs out, resume again. Without a terminal to ask in, resume prints a decision command bound to the pending interaction ID; run it only after a person has reviewed that call.

   ```bash
   npm start -- --agent-id "<agent-id>" --email "<work-email>" --show-json
   ```

   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.

6. **Check approve, reject, and cancel**
   Approve one run and confirm exactly one DM arrives. Run the command again and reject; confirm no DM arrives and the agent says the message was not sent. Run it a third time, press Enter, then run the resume command it printed and cancel the run (c); it ends cancelled with nothing pending. Only Slack can show whether a message was sent.

   ```bash
   npm start -- --agent-id "<agent-id>" --email "<work-email>" --show-json
   ```

7. **Clean up**
   Delete or archive the Cookbook approval demo agent in Agent Builder when you're done. Nothing here deletes runs, messages, or agents.
