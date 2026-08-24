---
name: gong-call-follow-up-n8n
description: 'Use the Glean Trigger node in n8n to summarize a Gong call, log it in Salesforce, and post a Slack heads-up.'
disable-model-invocation: true
---

## Before you start

- Glean Triggers enabled with the Gong preset available, Gong calls indexed, and credentials scoped for Triggers, Search, and Chat
- A publicly reachable n8n instance, or a local one exposed with npx n8n start --tunnel
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

- Will you use n8n Cloud or a local/self-hosted n8n instance? If local/self-hosted, choose a public HTTPS option before importing: n8n's development --tunnel, Cloudflare Tunnel, or another public ingress. Glean cannot deliver to localhost.
- What is your work email? It is used once to discover your Glean tenant and normalized API backend.
- Where should the follow-up go in Slack? Start with one channel id, or provide a Salesforce Account id → Slack channel id map if each account team has its own destination. Use ids, not names.

1. **Choose n8n hosting before scaffolding**
   Choose n8n Cloud or local/self-hosted n8n before downloading anything. Cloud is public by default. Local/self-hosted needs a public HTTPS webhook origin—use n8n's development `--tunnel`, Cloudflare Tunnel, or another ingress, and keep it available before publishing.

2. **Scaffold the workflow**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/gong-call-follow-up-n8n gong-call-follow-up-n8n
   ```

3. **Resolve the Glean backend**
   Run the cookbook resolver with the work email. It may see a legacy frontend address such as `*.askscio.com`, but it returns the API backend `https://<instance>-be.glean.com`. Use that result for Glean Chat; do not paste the discovery address into the workflow.

   ```bash
   cd gong-call-follow-up-n8n && node <cookbook-plugin-root>/scripts/resolve-backend.mjs "<work-email>"
   ```

4. **Install the Glean n8n nodes**
   In n8n, open Settings → Community nodes → Install and add `@gleanwork/n8n-nodes-gleanclient@0.4.2`. It provides the Trigger and Search nodes; the workflow uses an HTTP Request for Chat. Cloud works as shipped. For self-hosted n8n, set the webhook base to your public origin or start the development tunnel.

5. **Import the workflow**
   In n8n, choose Workflows → Import from File and select the scaffolded `workflow.json`; this is the route that keeps your local edits. Import from URL always fetches the untouched GitHub file. If your browser cannot see the scaffolded file, copy and paste it onto a blank canvas. Confirm that the ten nodes and Start here note appear.

6. **Attach credentials**
   Attach a Glean Trigger credential with `TRIGGERS`, a Glean Client credential with `SEARCH` and `CHAT`, plus your Salesforce and Slack credentials. The trigger follows the Glean credential owner; there is no separate user to select.

7. **Configure Glean Chat and Slack routing**
   Set the Glean Chat node to the backend returned by the resolver, then choose one reviewed Slack channel or an Account-to-channel map. n8n Variables can hold the backend and routing values, but they are optional.

8. **Verify the workflow with no credentials**
   Run the fixture verifier against recorded data. If you edited the local workflow.json, run `npm run verify:config` too. That command cannot see values entered in the n8n UI or stored in n8n Variables, so verify those configurations inside n8n before publishing.

   ```bash
   cd gong-call-follow-up-n8n && npm run verify:fixture
   ```

9. **Publish the workflow**
   Publish the workflow in n8n. The Glean Trigger node registers the production webhook and stores the signing secret used to verify deliveries.
   Once the integration is running, report its exact page URL or route as a clickable Markdown link.
   Do not open or automate it. Ask the user to click it in their normal browser where they are already
   signed in to Glean and confirm the page is ready. Then give the first verification action.

10. **Verify with a real Gong call**
    Make a short Gong call with yourself as a participant. Confirm one execution, one completed Salesforce activity on the matched Account, and one Slack post. Read the summary before widening the audience.

## Setup

- Scaffold n8n workflow
