---
name: gong-call-follow-up-n8n
description: 'Use the Glean Trigger node in n8n to summarize a Gong call, log it in Salesforce, and post a Slack heads-up.'
disable-model-invocation: true
---

## Before you start

- Glean Triggers enabled with the Gong preset available, Gong calls indexed, and credentials scoped for Triggers, Search, and Chat
- A publicly reachable n8n instance
- Permission to install the Glean n8n community nodes
- Salesforce and Slack credentials with the required write access
- Node 20+

Build "Automate Gong call follow-up with Glean Triggers in n8n" following https://developers.glean.com/cookbook/gong-call-follow-up-n8n

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

- Which Slack channel id should the heads-up go to? One central channel (C…) is the simplest start. If different account teams should see different calls, give a Salesforce Account id to Slack channel id map instead — ids, not names.

1. **Scaffold the workflow**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/gong-call-follow-up-n8n gong-call-follow-up-n8n
   ```

2. **Install the Glean n8n nodes**
   Settings, Community nodes, Install, then @gleanwork/n8n-nodes-gleanclient@0.4.1; verified end to end on n8n 2.35. It ships a Trigger and a Search action and no Chat node, so summarization is an HTTP Request. n8n Cloud works as shipped; self-hosted needs WEBHOOK_URL set to its public origin.

3. **Import the workflow**
   In n8n, use Workflows, Import from URL with the raw workflow.json link. If n8n cannot reach GitHub, copy and paste the workflow onto an empty canvas. Import from File uses the browser's filesystem, so it cannot see files scaffolded on a remote host. Confirm that ten nodes and the Start here note appear.

4. **Attach credentials**
   A TRIGGERS-scoped Glean Trigger credential for the trigger, a SEARCH+CHAT-scoped Glean Client credential for Search and Chat, plus Salesforce and Slack. The trigger matches the Glean credential owner's calls; there is no user to pick.

5. **Configure Glean Chat and Slack routing**
   Replace the placeholder backend URL in the Glean Chat node. Then configure either one reviewed central Slack channel or an Account-to-channel map in Resolve channel. n8n Variables may override these values but are not required.

6. **Verify the workflow with no credentials**
   Verifies the imported workflow, account resolution, Salesforce activity, and Slack routing using recorded data.

   ```bash
   cd gong-call-follow-up-n8n && npm run verify:fixture
   ```

7. **Publish the workflow**
   Publish in n8n. The Glean Trigger node registers n8n's production webhook and stores the one-time signing secret in workflow static data.
   Once the integration is running, report its exact page URL or route as a clickable Markdown link.
   Do not open or automate it. Ask the user to click it in their normal browser where they are already
   signed in to Glean and confirm the page is ready. Then give the first verification action.

8. **Verify with a real Gong call**
   Complete a short call with yourself as a participant. Confirm one execution, one completed Salesforce activity on the matched Account, and one Slack post, and read the summary before widening the audience.

## Setup

- Scaffold n8n workflow
