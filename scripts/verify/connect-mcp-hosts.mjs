// Nothing is scaffolded here -- the recipe points a host at Glean's remote MCP
// server via the first-party CLI. What's verifiable without driving a host GUI
// is the part the recipe actually depends on: that the resolved backend serves
// an MCP endpoint which authenticates, exposes the retrieval tool, and answers
// the demo queries.
//
// Whether a given host wrote its own config file is checked by the CLI itself;
// re-asserting it here would just re-implement @gleanwork/configure-mcp-server.

// A tools/list plus a search call. Deliberately does not run
// configure-mcp-server, so not even local host config is touched.
export const sideEffects = 'read-only';

export const requiredEnv = ['GLEAN_API_TOKEN', 'GLEAN_INSTANCE'];

// `search` is the tool Glean's own MCP docs call primary, and the one present on
// any instance. An earlier version of this module called `company_search`, which
// does not exist on any instance -- the endpoint answered 200 and returned a
// JSON-RPC error inside it, so a check that only looked at HTTP status would have
// called that a pass. Hence asserting the tool is listed before calling it.
const RETRIEVAL_TOOL = 'search';

function endpoint() {
  return `https://${process.env.GLEAN_INSTANCE}-be.glean.com/mcp/default`;
}

/** The endpoint may answer as JSON or as SSE, depending on the request. */
function parsePayload(text) {
  if (text.startsWith('event:') || text.startsWith('data:')) {
    const line = text.split('\n').find((l) => l.startsWith('data:'));
    if (!line)
      throw new Error(
        `SSE response carried no data line: ${text.slice(0, 200)}`,
      );
    return JSON.parse(line.slice(5));
  }
  return JSON.parse(text);
}

async function rpc(method, params) {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    payload: response.ok ? parsePayload(text) : null,
  };
}

export async function setup() {
  const { status, text, payload } = await rpc('tools/list', {});
  if (status === 401 || status === 403) {
    throw new Error(
      `MCP endpoint rejected the credential (${status}) — ${endpoint()}`,
    );
  }
  if (status >= 400) {
    throw new Error(`MCP endpoint returned ${status}: ${text.slice(0, 200)}`);
  }
  const tools = (payload.result?.tools ?? []).map((tool) => tool.name);
  if (tools.length === 0) {
    throw new Error(`MCP endpoint listed no tools: ${text.slice(0, 200)}`);
  }
  if (!tools.includes(RETRIEVAL_TOOL)) {
    throw new Error(
      `MCP endpoint does not expose "${RETRIEVAL_TOOL}". Listed: ${tools.join(', ')}`,
    );
  }
  return { tools };
}

export async function run(query) {
  const { status, text, payload } = await rpc('tools/call', {
    name: RETRIEVAL_TOOL,
    arguments: { query },
  });

  if (status >= 400) {
    return `MCP endpoint returned ${status}: ${text.slice(0, 200)}`;
  }
  // A JSON-RPC error arrives inside a 200, so the status alone proves nothing.
  if (payload.error) {
    return `MCP call returned a JSON-RPC error: ${JSON.stringify(payload.error).slice(0, 240)}`;
  }
  const content = payload.result?.content ?? [];
  const rendered = content
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (rendered.length === 0) {
    return `MCP ${RETRIEVAL_TOOL} returned no content for the query — nothing retrievable`;
  }
  if (payload.result?.isError) {
    return `MCP ${RETRIEVAL_TOOL} reported a tool error: ${rendered.slice(0, 200)}`;
  }
  return null;
}
