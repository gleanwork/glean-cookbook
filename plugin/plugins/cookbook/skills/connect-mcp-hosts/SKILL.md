---
name: connect-mcp-hosts
description: 'Point Claude Code, Cursor, and Claude Desktop at your Glean MCP endpoint and run one enterprise task from each — same context, three surfaces.'
disable-model-invocation: true
---

Build "Connect Glean MCP to your AI tools" following https://developers.glean.com/cookbook/connect-mcp-hosts

1. **Detect installed hosts**
   Check for Claude Code, Cursor, and Claude Desktop on this machine.

2. **Resolve your Glean backend**
   Resolve the backend from the user's work email — the Authentication section below has the exact command. The MCP server URL is {backend}/mcp/default.

3. **Configure each detected host**
   --client values: claude-code, cursor, claude-desktop. This is the real, GA, first-party CLI for this job — it handles OAuth with Dynamic Client Registration by default. Don't hand-walk a Configurator URL or ask for an API token.

   ```bash
   npx -y @gleanwork/configure-mcp-server remote --url https://{instance}-be.glean.com/mcp/default --client <host>
   ```

4. **Restart the host app**
   Cursor and Claude Code pick up the new server on restart; Claude Desktop needs the hammer icon to confirm Glean tools are available.

5. **Verify**
   Per host, ask "Who's on call for payments-service?" and confirm a real, Glean-cited answer.

## Reference

Glean MCP server URL: https://{instance}-be.glean.com/mcp/{server-name} (default server-name is "default"). @gleanwork/configure-mcp-server (npx -y @gleanwork/configure-mcp-server remote --url <url> --client <host>) is the real, GA, first-party CLI for wiring this up -- it handles OAuth with Dynamic Client Registration by default and writes the correct host-specific config (Claude Code/Cursor connect natively over HTTP; Claude Desktop is stdio-only, so the CLI wires the mcp-remote bridge automatically). Never reference @gleanwork/mcp-server (deprecated local package), never hand-walk the app.glean.com/settings/install MCP Configurator URL pattern when this CLI exists, and never tell users an API token is required by default -- pass --token only if a host genuinely doesn't support OAuth.

## Verify

{{> verify-gate}}

- **Query:** "Who's on call for payments-service?"
  **Expected:** The MCP host's chat surfaces a cited answer naming the current on-call owner, same shape as the Chat API path — MCP is a transport, not a different answer.
- **Query:** "Summarize PAY-2114"
  **Expected:** The MCP host's chat returns a cited summary of the real PAY-2114 incident, not a fabricated one.
