# Use Glean in your Hackathon

This is a fast-start integration recipe for hackathon teams building on Glean. It helps teams pick the smallest authenticated path for their idea before they write much code.

## Pick your auth path

1. Web SDK SSO: best for a browser app, portal, or internal page. Use the signed-in user's normal Glean browser session. No API token is needed, and Glean keeps enforcing that user's permissions.
2. Platform API token: best when your backend needs to call Search, Chat, or Agents directly. Use the cookbook `glean-auth.mjs login` flow to discover the tenant, complete OAuth, and write `GLEAN_SERVER_URL` plus `GLEAN_API_TOKEN` with only the scopes you need, such as `SEARCH`, `CHAT`, or `AGENTS`.
3. MCP plus Dynamic Client Registration: best for a custom agent or an AI tool that can speak MCP. Point it at `<backend>/mcp/default`; the OAuth flow can register the client dynamically and get scoped credentials without a pre-provisioned OAuth app.

Dynamic Client Registration is the RFC 7591-style OAuth pattern where a new client registers itself with the authorization server and receives a client id during setup. For Glean MCP, use [connect-mcp-hosts](../connect-mcp-hosts/) as the reference implementation: `npx -y @gleanwork/configure-mcp-server remote --url <backend>/mcp/default --client <host>`.

## Where to start

- Build a cited answer page: [company-answers](../company-answers/)
- Build a richer workspace around account or project context: [customer-360](../customer-360/)
- Connect an agent host or custom MCP client: [connect-mcp-hosts](../connect-mcp-hosts/)

See the full writeup at [developers.glean.com/cookbook/use-glean-in-your-hackathon](https://developers.glean.com/cookbook/use-glean-in-your-hackathon).
