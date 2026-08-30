# Search Glean with discovered filters

This TypeScript CLI uses the official `@gleanwork/api-client` to discover the datasources and common filter fields visible to you, request query-specific suggested values for one datasource, and apply the selection to Platform Search.

The recipe uses Glean OAuth by default. [`openid-client`](https://github.com/panva/openid-client) discovers the authorization server, dynamically registers a public client, runs Authorization Code with PKCE, and refreshes the grant before it expires. The Glean API client receives that refreshable token provider directly.

The Platform Search APIs are experimental, so the API client also sets `includeExperimental: true`. Each request attempt has a 30-second timeout, with bounded exponential backoff for transient API and connection failures.

## Run

```bash
npm install
npm run login -- --email "you@example.com"
npm start -- --query "quarterly planning"
```

The login command resolves your work email through `https://app.glean.com/config/search`, normalizes the returned tenant to its backend URL, and requests `openid offline_access SEARCH`. Use `--server-url` only when you need to override discovery. It stores the public client registration and OAuth access and refresh tokens outside the project in a mode-`0600` state file; `.env` receives only the non-secret server URL. The SDK's async `apiToken` callback reads or refreshes the access token for each API request.

DCR is controlled by tenant policy. If DCR rejects this client, redirect URI, or scope, set `GLEAN_OAUTH_CLIENT_ID` to an administrator-provisioned public client. To complete the tutorial without OAuth, set `GLEAN_SERVER_URL` and a user-scoped `GLEAN_API_TOKEN` with only `SEARCH`, then skip the login command. Glean-issued OAuth tokens do not need `X-Glean-Auth-Type`.

The core calls are the generated, typed SDK methods:

```ts
const { result: catalog } = await glean.search.listFilters();
const datasource = catalog.datasources.at(0)?.datasource;
if (!datasource) throw new Error('No visible datasources.');

const { result: suggestions } = await glean.search.listFilters(
  [datasource],
  'quarterly planning',
);
const field = suggestions.datasources
  .at(0)
  ?.filters.find((candidate) => candidate.values?.length);
const value = field?.values?.at(0);

const response = await glean.search.query({
  query: 'quarterly planning',
  datasources: [datasource],
  ...(field && value
    ? { filters: [{ field: field.field, values: [value], operator: 'EQUALS' }] }
    : {}),
});
```

The example keeps the API sequence explicit:

1. Call `glean.search.listFilters()` to list datasource identifiers and common fields.
2. Choose a datasource returned by discovery.
3. Call `glean.search.listFilters([datasource], query)` for query-specific suggested values.
4. Pass the selected datasource and optional filter to `glean.search.query()`.
5. Read the typed results, warnings, pagination state, and request ID.

Discovery is advisory. A field omitted from the catalog may still be valid, and suggested values are bounded hints rather than a guarantee of matching results.

For a deterministic non-interactive run, provide the datasource and optional filter explicitly:

```bash
npm start -- --query "quarterly planning" --datasource jira --field status --value "In Progress"
```

Use `--auto-select` only when choosing the first discovered datasource and suggested value is intentional, such as live verification.

Run the executable fixture tests, ESLint, and TypeScript compiler without credentials:

```bash
npm run check
```

Verify against your Glean instance after signing in:

```bash
npm run verify -- --query "a topic you know exists"
```

See the [OAuth authentication guide](https://developers.glean.com/api-info/client/authentication/oauth), [Platform Search API](https://developers.glean.com/api/platform-api/search-overview), [Search Filters reference](https://developers.glean.com/api/platform-api/platform-search-filters), and [experimental API policy](https://developers.glean.com/experimental/overview).
