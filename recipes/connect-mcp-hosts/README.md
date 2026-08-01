# connect-mcp-hosts

Connect Claude Code, Cursor, and Claude Desktop to the Glean remote MCP server and run one enterprise task from each — same context, three surfaces.

## Run it

1. Find your Glean backend URL: `https://{instance}-be.glean.com/mcp/default` (find `{instance}` at `app.glean.com/admin/about-glean`, under Server instance — or resolve it from your work email via `https://app.glean.com/config/search`).
2. For each host you have installed, run `@gleanwork/configure-mcp-server` — the real, GA, first-party CLI for this job. It handles OAuth with Dynamic Client Registration by default; you don't need an API token, and there's no MCP Configurator web flow to hand-walk.

   ```bash
   npx -y @gleanwork/configure-mcp-server remote --url https://{instance}-be.glean.com/mcp/default --client <host>
   ```

   `<host>` is one of `claude-code`, `cursor`, `claude-desktop` (the CLI also supports codex, goose, jetbrains, junie, vscode, and windsurf — run `npx -y @gleanwork/configure-mcp-server help` for the full list).

3. Restart the host app — Cursor and Claude Code pick up the new server on restart; Claude Desktop needs the hammer icon to confirm Glean tools are available.

## Why Claude Desktop's config looks different

Claude Code and Cursor support the remote MCP server natively over HTTP. Claude Desktop only supports stdio, so it needs the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge — the CLI detects this per-host and wraps the same URL in it automatically. You don't need to know this to run the command above; it's just why the two config shapes differ if you go looking at what got written.

## Verify

Ask the same question from each host — **"Who's on call for payments-service?"** — and confirm each returns a Glean-cited answer.
