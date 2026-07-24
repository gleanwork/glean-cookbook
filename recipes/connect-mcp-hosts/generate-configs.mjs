/**
 * Generate real Glean MCP host configs for Claude Code, Cursor, and Claude
 * Desktop — using @gleanwork/mcp-config-schema's own builders, not
 * hand-typed JSON. This is what the MCP Configurator (Settings → Install →
 * MCP Configurator, see /guides/mcp) generates for you automatically; this
 * script exists so you can see exactly what it produces and why the three
 * hosts differ.
 *
 * The MCP Configurator is still the recommended path for real setup — it
 * handles OAuth for you. This script is for understanding/CI, not a
 * replacement for it.
 */

import {
  ClaudeCodeConfigBuilder,
  CursorConfigBuilder,
  GenericConfigBuilder,
  MCPConfigRegistry,
} from '@gleanwork/mcp-config-schema';
import fs from 'node:fs';

const instance = process.env.GLEAN_INSTANCE ?? 'acme';
const serverUrl = `https://${instance}-be.glean.com/mcp/default`;
// A real setup authenticates via OAuth through the MCP Configurator; this
// placeholder header is only here so the generated JSON is inspectable
// without a live token.
const headers = { Authorization: 'Bearer ${GLEAN_API_TOKEN}' };

const registry = new MCPConfigRegistry();

const configs = {
  'claude-code.json': new ClaudeCodeConfigBuilder(
    registry.getConfig('claude-code'),
  ).buildConfiguration({
    serverName: 'glean',
    transport: 'http',
    serverUrl,
    headers,
  }),

  'cursor.json': new CursorConfigBuilder(
    registry.getConfig('cursor'),
  ).buildConfiguration({
    serverName: 'glean',
    transport: 'http',
    serverUrl,
    headers,
  }),

  // Claude Desktop is stdio-only (registry.clientNeedsMcpRemote('claude-desktop')
  // === true) — the builder detects this and wraps the same HTTP endpoint in
  // the mcp-remote bridge automatically. Requesting transport: 'http' here is
  // correct; the builder decides the actual wire format per client.
  'claude-desktop.json': new GenericConfigBuilder(
    registry.getConfig('claude-desktop'),
  ).buildConfiguration({
    serverName: 'glean',
    transport: 'http',
    serverUrl,
    headers,
  }),
};

for (const [filename, config] of Object.entries(configs)) {
  fs.writeFileSync(filename, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${filename}`);
}
