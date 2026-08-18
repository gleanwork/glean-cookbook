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
   Provide the work email that owns the agent and the exact customer sender domain to watch. Only messages this user receives from that domain should match.

2. **Add the Glean plugin marketplace**
   Claude Code users add the marketplace with the command above. Cursor users open Customize in the sidebar, find Glean vNext, and Install it at user scope, then skip the next step; a team admin can instead add the marketplace under Dashboard, Plugins, Add Marketplace, Import from Repo.

   ```bash
   claude plugin marketplace add gleanwork/glean-plugins-vnext
   ```

3. **Install the agent-builder plugin**
   Installs the agent_builder skill at user scope so it stays available across projects. Cursor users skip this step.

   ```bash
   claude plugin install glean-vnext@glean-plugins-vnext --scope user
   ```

4. **Reload the host and confirm the plugin**
   Reload or restart the host so the plugin loads, then confirm /glean_run resolves.
   {{> run-host-configuration}}

5. **Authenticate the plugin**
   Run setup, provide the Server instance (QE) URL from Glean's About page, then complete browser sign-in. Never use an API token.

6. **Build the agent with the headless builder**
   Run /glean_run agent_builder and name the target directory. Ask for a Gmail thread trigger scoped to the owner and customer domain, search grounding, a reply-draft tool, and an owner-only Slack DM. Require no email-send tool, and no tool calls when the latest thread item is a draft, owner-authored, or already handled. Let the builder discover tenant-specific IDs.

7. **Preview against a real thread**
   Run the agent against a real Gmail thread URL, naming the same directory; it arrives as the reserved content input. Hand anything wrong back to agent_builder rather than editing the spec.

8. **Review the boundary, publish, and activate**
   Show the trigger scope and the unattended write boundary, take one explicit confirmation, then save. Publishing does not activate: on the returned page allow connected-app actions, select Activate agent, and confirm ACTIVE.

9. **Verify with a real email**
   Send one genuine customer question from the chosen domain. Expect one run, one unsent draft on the original thread, and one Slack DM to the owner.
