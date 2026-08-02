// Nothing is scaffolded here -- the recipe points a host at Glean's remote MCP
// server via the first-party CLI. What's verifiable without driving a host GUI
// is the part the recipe actually depends on: that the resolved backend serves
// an MCP endpoint which authenticates and answers the demo queries.
//
// Whether a given host wrote its own config file is checked by the CLI itself;
// re-asserting it here would just re-implement @gleanwork/configure-mcp-server.

export const requiredEnv = ['GLEAN_API_TOKEN', 'GLEAN_INSTANCE'];

function endpoint() {
  return `https://${process.env.GLEAN_INSTANCE}-be.glean.com/mcp/default`;
}

async function callTool(query) {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'company_search', arguments: { query } },
    }),
  });
  const text = await response.text();
  return { status: response.status, text };
}

export async function run(query) {
  const { status, text } = await callTool(query);
  if (status === 401 || status === 403) {
    return `MCP endpoint rejected the credential (${status}) — ${endpoint()}`;
  }
  if (status >= 400) {
    return `MCP endpoint returned ${status}: ${text.slice(0, 200)}`;
  }
  if (/"error"/.test(text) && !/"result"/.test(text)) {
    return `MCP call returned a JSON-RPC error: ${text.slice(0, 240)}`;
  }
  if (text.trim().length === 0) {
    return 'MCP call returned an empty body — no searchable result for the query';
  }
  return null;
}
