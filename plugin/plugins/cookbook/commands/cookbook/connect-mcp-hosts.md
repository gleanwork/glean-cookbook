---
name: connect-mcp-hosts
description: 'Point Claude Code, Cursor, and Claude Desktop at your Glean MCP endpoint and run one enterprise task from each — same context, three surfaces.'
---

Connect me to the Glean remote MCP server following
https://developers.glean.com/cookbook/connect-mcp-hosts

1. Detect which MCP hosts I have installed (Claude Code, Cursor, Claude
   Desktop).
2. Use the MCP Configurator flow from https://developers.glean.com/guides/mcp
   to add the remote server for each — OAuth is the primary auth; do NOT
   tell me I need an API token. The Configurator URL pattern is
   https://app.glean.com/settings/install?mcpConfigure=true&mcpHost=<slug>
   (slugs: claude-code, cursor, claude-desktop).
3. Note that Claude Code and Cursor connect natively over HTTP
   (type: "http"), while Claude Desktop is stdio-only and needs the
   mcp-remote bridge (type: "stdio", command npx mcp-remote <url>) —
   don't write an http config for Claude Desktop, it won't work.
4. Verify per host by asking "Who's on call for payments-service?" and
   confirming a Glean-cited answer.

## Setup

- Scaffold MCP config

## Reference

Glean MCP server URL: https://{instance}-be.glean.com/mcp/{server-name} (default server-name is "default"). Claude Code and Cursor support native HTTP transport with a Bearer auth header. Claude Desktop only supports stdio and requires the mcp-remote bridge (npx mcp-remote <url> --header "Authorization: Bearer <token>"). Never reference @gleanwork/mcp-server (deprecated local package) or tell users an API token is required — OAuth via the MCP Configurator is primary.
