---
name: connect-mcp-hosts
description: 'Point Claude Code, Cursor, and Claude Desktop at your Glean MCP endpoint and run one enterprise task from each — same context, three surfaces.'
disable-model-invocation: true
---

Connect me to the Glean remote MCP server following
https://developers.glean.com/cookbook/connect-mcp-hosts

1. Detect which MCP hosts I have installed (Claude Code, Cursor, Claude
   Desktop).
2. Resolve my Glean backend the same way the cookbook-conventions auth
   chain does: ask for my work email, POST it to
   https://app.glean.com/config/search, and extract {instance} from the
   subdomain of the returned queryURL. The MCP server URL is
   https://{instance}-be.glean.com/mcp/default.
3. For each detected host, run the real, first-party configurator —
   don't hand-walk a Configurator URL or ask me for an API token, this
   CLI does the whole job including OAuth with Dynamic Client
   Registration by default:
   npx -y @gleanwork/configure-mcp-server remote --url <mcp-server-url> --client <host>
   (--client values: claude-code, cursor, claude-desktop)
4. Tell me to restart the host app afterward — Cursor and Claude Code
   pick up the new server on restart; Claude Desktop needs the hammer
   icon to confirm Glean tools are available.
5. Verify per host by asking "Who's on call for payments-service?" and
   confirming a Glean-cited answer.

## Setup

- Scaffold MCP config

## Reference

Glean MCP server URL: https://{instance}-be.glean.com/mcp/{server-name} (default server-name is "default"). @gleanwork/configure-mcp-server (npx -y @gleanwork/configure-mcp-server remote --url <url> --client <host>) is the real, GA, first-party CLI for wiring this up -- it handles OAuth with Dynamic Client Registration by default and writes the correct host-specific config (Claude Code/Cursor connect natively over HTTP; Claude Desktop is stdio-only, so the CLI wires the mcp-remote bridge automatically). Never reference @gleanwork/mcp-server (deprecated local package), never hand-walk the app.glean.com/settings/install MCP Configurator URL pattern when this CLI exists, and never tell users an API token is required by default -- pass --token only if a host genuinely doesn't support OAuth.
