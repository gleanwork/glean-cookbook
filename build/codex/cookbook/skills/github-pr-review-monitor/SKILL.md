---
name: github-pr-review-monitor
description: 'Use Glean Triggers to send GitHub review events to Claude Code Monitor, which runs your local review skill against the diff and prepares a first-pass review draft.'
disable-model-invocation: true
---

## Before you start

- Glean Triggers enabled with GitHub review presets available in your deployment
- GitHub content indexed in Glean
- A local checkout of the repository, with the GitHub CLI signed in as the reviewer
- An interactive Claude Code session, or the terminal stream where Monitor is unavailable
- Node 20+ and a public HTTPS tunnel to the receiver

Build "Draft PR reviews with Glean Triggers and Claude Code Monitor" following https://developers.glean.com/cookbook/github-pr-review-monitor

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
- Which local GitHub repository should Claude Code review?
- Which public HTTPS URL should receive Glean webhook delivery? If you do not have one, say so and the tunnel step prints one.

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the receiver and plugin**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/github-pr-review-monitor github-pr-review-monitor
   ```

2. **Verify the local path with no credentials**
   Use recorded events to verify the signed receiver, event queue, and draft-review flow.

   ```bash
   cd github-pr-review-monitor && npm run verify:fixture
   ```

3. **Sign in to Glean**
   Sign in to discover your tenant and save GLEAN_SERVER_URL and GLEAN_API_TOKEN to the ignored .env file. An exported GLEAN_API_TOKEN takes precedence over .env, and the scripts warn you when it does.

   ```bash
   cd github-pr-review-monitor && npm run login -- --email "<work-email>"
   ```

4. **Run the receiver**
   Keep the receiver running. It listens on loopback, verifies signatures, and queues each webhook ID once.

   ```bash
   cd github-pr-review-monitor && npm start
   ```

   Keep required services and tunnels running. Report the current checkpoint and any exact endpoint
   printed. Then give the next manual or verification action.

5. **Expose the receiver over HTTPS**
   Append /webhook to the printed origin and set GLEAN_WEBHOOK_URL before registering. Keep the tunnel running: triggers outlive the tunnel, so closing it sends future deliveries to a dead address.

   ```bash
   cd github-pr-review-monitor && cloudflared tunnel --url http://127.0.0.1:8787
   ```

6. **Register the review triggers**
   Set GLEAN_TRIGGER_DATASOURCE and the preset IDs to register. If you leave the IDs empty, setup lists the presets available in your deployment and stops instead of guessing. Provide required preset inputs through GLEAN_TRIGGER_INPUT_<FIELD>.

   ```bash
   cd github-pr-review-monitor && npm run setup
   ```

7. **Attach Claude Code Monitor**
   Validate the plugin, then restart Claude Code from the repository under review so Monitor starts with the session. If Monitor is unavailable, run npm run stream to receive the same events in the terminal.

   ```bash
   cd github-pr-review-monitor && claude plugin validate . --strict
   ```

8. **Verify a real review request**
   Request a review from yourself on a real pull request. Confirm one queued event and one draft grounded in the current diff. The workflow makes no GitHub write until you ask for one.
