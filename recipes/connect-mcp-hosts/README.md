# connect-mcp-hosts

Connect Claude Code, Cursor, and Claude Desktop to the Glean remote MCP server and run one enterprise task from each — same context, three surfaces.

## Recommended: the MCP Configurator

For real setup, use the **MCP Configurator** (Settings → Your Settings → Install tab → MCP Configurator), or jump straight to a host's config page:

- Claude Code: `https://app.glean.com/settings/install?mcpConfigure=true&mcpHost=claude-code`
- Cursor: `https://app.glean.com/settings/install?mcpConfigure=true&mcpHost=cursor`
- Claude Desktop: `https://app.glean.com/settings/install?mcpConfigure=true&mcpHost=claude-desktop`

The Configurator authenticates via **OAuth** — no API token needed for supported hosts. See [/guides/mcp](https://developers.glean.com/guides/mcp).

## What's in this directory

`generate-configs.mjs` uses `@gleanwork/mcp-config-schema` — the same library behind the Configurator — to generate the config each host actually needs, so you can see exactly what gets written and why the three differ:

```bash
npm install
GLEAN_INSTANCE=acme node generate-configs.mjs
```

`claude-code.json`, `cursor.json`, and `claude-desktop.json` are checked in as reference output (`instance=acme`, a placeholder token).

## Why the three configs differ

- **Claude Code** and **Cursor** support the remote MCP server natively over HTTP:
  ```json
  {
    "mcpServers": {
      "glean": {
        "type": "http",
        "url": "https://acme-be.glean.com/mcp/default",
        "headers": { "Authorization": "Bearer ${GLEAN_API_TOKEN}" }
      }
    }
  }
  ```
- **Claude Desktop** only supports stdio, so it needs the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge — the schema library detects this (`registry.clientNeedsMcpRemote('claude-desktop')` is `true`) and wraps the same URL automatically:
  ```json
  {
    "mcpServers": {
      "glean": {
        "type": "stdio",
        "command": "npx",
        "args": [
          "-y",
          "mcp-remote",
          "https://acme-be.glean.com/mcp/default",
          "--header",
          "Authorization: Bearer ${GLEAN_API_TOKEN}"
        ]
      }
    }
  }
  ```

Every server URL follows `https://{instance}-be.glean.com/mcp/{server-name}` — find yours at `app.glean.com/admin/about-glean`, under Server instance.

## Verify

Ask the same question from each host — **"Who's on call for payments-service?"** — and confirm each returns a Glean-cited answer.
