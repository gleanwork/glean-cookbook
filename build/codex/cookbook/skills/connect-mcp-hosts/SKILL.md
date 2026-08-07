---
name: connect-mcp-hosts
description: 'Point Claude Code, Cursor, and Claude Desktop at your Glean MCP endpoint and run one enterprise task from each — same context, three surfaces.'
disable-model-invocation: true
---

## Before you start

- Glean MCP server enabled for your deployment (admin toggle)
- At least one MCP host installed (Claude Code, Cursor, or Claude Desktop)

Build "Connect Glean MCP to your AI tools" following https://developers.glean.com/cookbook/connect-mcp-hosts

Ask these before running commands. Ask one at a time, waiting for each
answer before asking the next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- Which installed MCP host should be configured?
- What topic do you know exists in your Glean content for verification?

1. **Detect installed hosts**
   Check for supported hosts, then ask which one the user wants configured. Do not configure every detected host by default.

2. **Resolve your Glean backend**
   Ask for the user's work email. Locate the installed cookbook plugin root from this skill, run its bundled resolver, and copy the returned backend value. The MCP server URL is <resolved-backend>/mcp/default.

   ```bash
   node <cookbook-plugin-root>/scripts/resolve-backend.mjs "<work-email>"
   ```

3. **Configure the selected host**
   --client values: claude-code, cursor, claude-desktop. This is the real, GA, first-party CLI for this job — it handles OAuth with Dynamic Client Registration by default. Don't hand-walk a Configurator URL or ask for an API token.

   ```bash
   npx -y @gleanwork/configure-mcp-server remote --url <resolved-backend>/mcp/default --client <host>
   ```

4. **Restart the host app**
   Cursor and Claude Code pick up the new server on restart; Claude Desktop needs the hammer icon to confirm Glean tools are available.

5. **Verify**
   Per host, ask "Who's on call for payments-service?" and confirm a real, Glean-cited answer.
