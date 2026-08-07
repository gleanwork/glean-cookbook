---
name: connect-mcp-hosts
description: 'Point Claude Code, Cursor, and Claude Desktop at your Glean MCP endpoint and run one enterprise task from each — same context, three surfaces.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `MCP`
- Glean MCP server enabled for your deployment (admin toggle)
- At least one MCP host installed (Claude Code, Cursor, or Claude Desktop)

Build "Connect Glean MCP to your AI tools" following https://developers.glean.com/cookbook/connect-mcp-hosts

1. **Detect installed hosts**
   Check for Claude Code, Cursor, and Claude Desktop on this machine.

2. **Resolve your Glean backend**
   Ask for the user's work email. Locate the installed cookbook plugin root from this skill, run its bundled resolver, and copy the returned backend value. The MCP server URL is <resolved-backend>/mcp/default.

   ```bash
   node <cookbook-plugin-root>/scripts/resolve-backend.mjs "<work-email>"
   ```

3. **Configure each detected host**
   --client values: claude-code, cursor, claude-desktop. This is the real, GA, first-party CLI for this job — it handles OAuth with Dynamic Client Registration by default. Don't hand-walk a Configurator URL or ask for an API token.

   ```bash
   npx -y @gleanwork/configure-mcp-server remote --url <resolved-backend>/mcp/default --client <host>
   ```

4. **Restart the host app**
   Cursor and Claude Code pick up the new server on restart; Claude Desktop needs the hammer icon to confirm Glean tools are available.

5. **Verify**
   Per host, ask "Who's on call for payments-service?" and confirm a real, Glean-cited answer.

## Reference

Use https://{instance}-be.glean.com/mcp/{server-name}; the default server name is default. Configure hosts with npx -y @gleanwork/configure-mcp-server remote --url <url> --client <host>. OAuth with Dynamic Client Registration is the default. Claude Code and Cursor connect over HTTP; Claude Desktop uses the CLI-managed mcp-remote bridge. Supply --token only when the host cannot use OAuth.

## Verify

{{> verify-gate}}

- **Query:** "What does our team own?"
  **Expected:** The MCP host's chat returns an answer grounded in your Glean content, with citations, proving the server is connected and authenticated.
- **Query:** "Summarize our most recent incident review"
  **Expected:** The host returns a cited summary grounded in your own content — not a fabricated one. If it answers without citations, the MCP server is not actually being consulted.
