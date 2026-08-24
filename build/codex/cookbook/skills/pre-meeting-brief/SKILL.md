---
name: pre-meeting-brief
description: 'Use a Glean calendar trigger to start Cursor Automations before a recurring meeting, summarize what changed, and update the project tracker.'
disable-model-invocation: true
---

## Before you start

- Glean Triggers enabled with an ahead-of-event calendar preset available and Google Calendar events indexed
- A Cursor plan with Automations and webhook triggers, which is a paid feature
- Cursor connected to the project tracker over MCP with permission to read issues and write project updates; Glean MCP is optional
- Node 20+

Build "Brief recurring meetings with Glean Triggers and Cursor Automations" following https://developers.glean.com/cookbook/pre-meeting-brief

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
- Which reviewed meeting-title pattern identifies the recurring meeting? It filters the trigger at the source and is also what the automation accepts. Matching is a case-insensitive substring and matches mid-word, so pick a distinctive phrase rather than a short word.
- Which project should receive the update? Paste its URL or its id — the automation takes the id out of a URL. Not a name: it refuses to infer a target.
- Where is the work tracked? Usually the same project you are updating — say so and the automation discovers the fields itself. Name a table and its timestamp column only for a warehouse.

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

The recipe needs a secret issued by a third-party service. Tell the user which value to obtain and
where it appears, then have them write it directly into the recipe's ignored `.env`. Never ask for
the value in chat, never echo it, and never place it in a command. Confirm the file is filled and
carry on — the shipped scripts read `.env` themselves.

1. **Set up the automation kit**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/pre-meeting-brief pre-meeting-brief
   ```

2. **Create the Cursor Automation**
   Create a webhook-triggered Cursor Automation and connect the tracker. Add Glean MCP if you want cited context, then paste the prompt from automation-prompt.md and fill in its three placeholders. Save the automation before copying its webhook URL and bearer token into the ignored .env file.

3. **Verify the delivery contract with no credentials**
   Use the recorded events to check calendar delivery and the recurring-brief workflow before connecting real accounts.

   ```bash
   cd pre-meeting-brief && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Use the shipped OAuth flow; it discovers your tenant and registers a client dynamically. If OAuth is unavailable, use a `TRIGGERS`-scoped API token.

   ```bash
   cd pre-meeting-brief && npm run login -- --email "<work-email>"
   ```

5. **Preview your calendar events**
   See which presets your deployment offers and review recent indexed events. Use real meeting titles to test your pattern before registering anything. This step is read-only.

   ```bash
   cd pre-meeting-brief && npm run preview
   ```

6. **Enable the automation**
   Enable the automation before testing. A disabled automation might ignore a delivery, so the receiver test would prove nothing. Enabling it only allows Cursor to run; the webhook URL and key stay private. Registering the Glean trigger later puts it in production.
   Once the integration is running, report its exact page URL or route as a clickable Markdown link.
   Do not open or automate it. Ask the user to click it in their normal browser where they are already
   signed in to Glean and confirm the page is ready. Then give the first verification action.

7. **Test it before going live**
   Webhook triggers do not have a test button, so send one delivery yourself. The default command uses a non-matching title and writes nothing. After it succeeds, ask for explicit approval before running `npm run test:webhook -- --write`; that path creates one tracker update and each repeat is a new occurrence.

   ```bash
   cd pre-meeting-brief && npm run test:webhook
   ```

8. **Register the calendar trigger**
   Setup reads the preset catalog, checks the selected preset's inputs, and rejects unsupported values. Set `GLEAN_TRIGGER_INPUT_TITLE` to the reviewed pattern so Glean filters by title at the source. Choose a calendar preset that supports delivery 1,800 seconds before the event.

   ```bash
   cd pre-meeting-brief && npm run setup
   ```

9. **Try one scheduled meeting**
   Schedule a meeting that matches your title pattern and starts more than 30 minutes from now. Confirm one run and one update on the configured project. The first brief looks back seven days; later briefs cover only the time since the previous one.
