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

{{> demo-mode}}

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- Which local GitHub repository should Claude Code review?
- Which public HTTPS URL should receive Glean webhook delivery? If you do not have one, say so and the tunnel step prints one.

{{> oauth-setup}}

1. **Scaffold the receiver and plugin**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/github-pr-review-monitor github-pr-review-monitor
   ```

2. **Verify the local path with no credentials**
   Verifies the signed receiver, event queue, and draft-review flow using recorded events.

   ```bash
   cd github-pr-review-monitor && npm run verify:fixture
   ```

3. **Sign in to Glean**
   Discovers your tenant and writes GLEAN_SERVER_URL and GLEAN_API_TOKEN to an ignored .env. An exported GLEAN_API_TOKEN outranks .env, and the scripts warn when it does.

   ```bash
   cd github-pr-review-monitor && npm run login -- --email "<work-email>"
   ```

4. **Run the receiver**
   Keep this running. It binds to loopback, verifies signatures, and queues each webhook id once.

   ```bash
   cd github-pr-review-monitor && npm start
   ```

   {{> run-hybrid-service}}

5. **Expose the receiver over HTTPS**
   Append /webhook to the printed origin and set GLEAN_WEBHOOK_URL before registering. Leave the tunnel running — the triggers outlive it, so a closed tunnel means deliveries to a dead address.

   ```bash
   cd github-pr-review-monitor && cloudflared tunnel --url http://127.0.0.1:8787
   ```

6. **Register the review triggers**
   Set GLEAN_TRIGGER_DATASOURCE and the preset ids you want to register. With no ids configured, setup lists the presets your deployment serves and stops. Presets that require inputs read them from GLEAN_TRIGGER_INPUT_<FIELD>.

   ```bash
   cd github-pr-review-monitor && npm run setup
   ```

7. **Attach Claude Code Monitor**
   Validate the plugin, then restart Claude Code from the repository being reviewed so Monitor starts with the session. Where Monitor is unavailable, run npm run stream to receive the same events in the terminal.

   ```bash
   cd github-pr-review-monitor && claude plugin validate . --strict
   ```

8. **Verify a real review request**
   Request a review from yourself on a real pull request. Expect one queued event and one draft grounded in the current diff, with no GitHub write until you ask for one.
