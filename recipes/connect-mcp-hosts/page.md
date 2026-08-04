## Problem

Your team already lives in Claude Code, Cursor, and Claude Desktop. Connect
each to the same Glean remote MCP server and every one of them can search,
summarize, and answer from your company's permission-aware knowledge — no
per-host reimplementation, no separate index.

## Take it further

- Ask an onboarding question ("explain how payments-service handles retries")
  right after cloning a repo — no context-switching to search separately.
- Compare tool selection across hosts for the same prompt — each host's MCP
  client decides which Glean tools to call, and they don't always agree.
- Ask an incident-investigation question ("what changed in payments-service
  recently?") to see multi-tool chaining (search + code) in one turn.
