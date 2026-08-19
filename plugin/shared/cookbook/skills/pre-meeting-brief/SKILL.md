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

{{> demo-mode}}

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- Which reviewed meeting-title pattern identifies the recurring meeting?
- Which project should receive the update? Paste its URL or its id — the automation takes the id out of a URL. Not a name: it refuses to infer a target.
- Where is the work tracked? Usually the same project you are updating — say so and the automation discovers the fields itself. Name a table and its timestamp column only for a warehouse.

{{> oauth-setup}}

{{> auth-external-api-key}}

1. **Scaffold the automation kit**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/pre-meeting-brief pre-meeting-brief
   ```

2. **Configure the Cursor Automation**
   Create a webhook-triggered Cursor Automation, connect the tracker and optionally Glean MCP, and paste the fenced prompt from automation-prompt.md after replacing all three placeholders. Save the automation, then store its webhook URL and bearer token in the ignored .env file.

3. **Verify the delivery contract with no credentials**
   Verifies the calendar-delivery and recurring-brief workflow using recorded events.

   ```bash
   cd pre-meeting-brief && npm run verify:fixture
   ```

4. **Sign in to Glean**
   Use the shipped OAuth flow, which registers a client dynamically. A TRIGGERS-scoped API token is the fallback.

   ```bash
   cd pre-meeting-brief && npm run login -- --email "<work-email>"
   ```

5. **Preview indexed calendar events**
   Lists what your deployment serves and shows recent indexed events, so the meeting-title pattern is checked against real titles before anything is registered. Read-only.

   ```bash
   cd pre-meeting-brief && npm run preview
   ```

6. **Enable the automation**
   Enable it now, before testing: a disabled automation may take no action on a delivery, so the receiver test would prove nothing. Enabling only makes it able to run — nobody else holds the webhook URL or key. Registering the Glean trigger, later, is what puts it in production.
   {{> run-existing-app}}

7. **Test the receiver before registering**
   A webhook trigger is a private endpoint with no test button, so post one delivery yourself. The title is built from the pattern you configured, so the run does the work rather than exiting ignored.

   ```bash
   cd pre-meeting-brief && npm run test:webhook
   ```

8. **Register the trigger**
   Setup reads the selected preset's required inputs from GLEAN_TRIGGER_INPUT_<FIELD> and rejects unsupported values. For this recipe, select a calendar preset that supports delivery 1,800 seconds before the event.

   ```bash
   cd pre-meeting-brief && npm run setup
   ```

9. **Verify one scheduled meeting**
   Put a meeting matching your title pattern more than 30 minutes out. Confirm one run and one update on the configured project. On the first run, expect a labeled seven-day lookback; later occurrences cover only the interval since the previous brief.
