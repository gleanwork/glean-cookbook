---
name: customer-email-draft-agent
description: 'Use Glean Headless Agent Builder from Claude Code or Cursor to create a content-triggered agent that watches one customer domain, drafts grounded Gmail replies, and alerts you in Slack.'
disable-model-invocation: true
---

## Before you start

- Glean Headless Agent Builder enabled for auto-mode agents, with content triggers available
- Gmail content indexed in Glean, including messages from the chosen customer domain
- Gmail draft and owner-only Slack DM actions enabled for your account
- Claude Code, or Cursor with Glean vNext available in its plugin marketplace

Build "Build a customer email agent with Glean Headless Agent Builder" following https://developers.glean.com/cookbook/customer-email-draft-agent

{{> ask-setup-questions}}

- What is your work email? It identifies the agent owner and Slack notification recipient.
- Which customer email domain should trigger the agent?

1. **Choose the mailbox and customer domain**
   Provide the work email that owns the agent and the exact customer sender domain to watch. The trigger matches only messages that this user receives from that domain.

2. **Add the Glean plugin marketplace**
   In Claude Code, add the marketplace with the command above. In Cursor, open Customize, find Glean vNext, and install it at user scope. A team admin can add it under Dashboard → Plugins → Add Marketplace → Import from Repo.

   ```bash
   claude plugin marketplace add gleanwork/glean-plugins-vnext
   ```

3. **Install the agent-builder plugin**
   Install the agent_builder skill at user scope so it remains available across projects. Cursor users can skip this step.

   ```bash
   claude plugin install glean-vnext@glean-plugins-vnext --scope user
   ```

4. **Reload the host and confirm the plugin**
   Reload or restart the host so it loads the plugin. Then confirm that /glean_run resolves.
   {{> run-host-configuration}}

5. **Authenticate the plugin**
   Run setup, enter your work email when prompted, and complete the browser sign-in. The current setup flow does not require a server URL or API token.

6. **Build the agent with the headless builder**
   Run /glean_run agent_builder and name the target directory. Use the builder to generate the agent files; do not manually author or edit spec.yaml or instructions.md. Request a Gmail thread trigger scoped to the owner and customer domain, search grounding, a reply-draft tool, and an owner-only Slack DM. Do not add an email-send tool. Stop without tool calls when the latest thread item is a draft, owner-authored, or already handled. Let the builder discover tenant-specific IDs.

7. **Preview against a real thread**
   Run the agent against a real Gmail thread URL and name the same directory. The URL is passed as the reserved content input; inspect the run result before publishing. If the result is wrong, return to agent_builder instead of manually editing the generated spec or instructions.

8. **Review the boundary, publish, and activate**
   Review the trigger scope and the unattended write boundary, then give one explicit confirmation before saving. Saving publishes the agent but does not activate it. On the returned page, allow connected-app actions, select Activate agent, and confirm ACTIVE.

9. **Verify with a real email**
   Send one genuine customer question from the chosen domain. Confirm one run, one unsent draft on the original thread, and one Slack DM to the owner.
