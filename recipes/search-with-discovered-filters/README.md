# Search Glean with discovered filters

This TypeScript CLI uses the official `@gleanwork/api-client` to discover the datasources and common filter fields visible to you, request query-specific suggested values for one datasource, and apply the selection to Platform Search.

The recipe uses `@gleanwork/auth` for tenant discovery, OAuth login, secure credential storage, and automatic token refresh. The Platform Search APIs are experimental, so the API client sets `includeExperimental: true`. Each request attempt has a 30-second timeout, with bounded exponential backoff for transient API and connection failures.

## Run

Requires Node.js 22.12.0 or newer.

```bash
npm install
npm run login -- --email "you@example.com"
npm start -- --email "you@example.com" --query "quarterly planning"
```

The login command discovers your Glean backend from your work email and requests `openid offline_access search`. Use `--server-url "https://<instance>-be.glean.com"` instead of `--email` when you need an explicit backend origin. The auth package stores the public client registration and OAuth access and refresh tokens outside the project under your user state directory.

Dynamic Client Registration is controlled by tenant policy. If DCR rejects the client, redirect URI, or scope, set `GLEAN_OAUTH_CLIENT_ID` to an administrator-provisioned public client. To use a Glean-issued token instead, set `GLEAN_SERVER_URL` and a user-scoped `GLEAN_API_TOKEN`, then omit `--email`. Glean-issued OAuth tokens do not need `X-Glean-Auth-Type`.

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
npm start -- --email "you@example.com" --query "quarterly planning" --datasource jira --field status --value "In Progress"
```

Use `--auto-select` only when choosing the first discovered datasource and suggested value is intentional, such as live verification.

Run the Vitest fixture tests without credentials or network access:

```bash
npm test
```

To run the complete local validation suite, including ESLint and the TypeScript compiler:

```bash
npm run test:all
```

Verify against your Glean instance after signing in:

```bash
npm run verify -- --email "you@example.com" --query "a topic you know exists"
```

See the [OAuth authentication guide](https://developers.glean.com/api-info/client/authentication/oauth), [Platform Search API](https://developers.glean.com/api/platform-api/search-overview), [Search Filters reference](https://developers.glean.com/api/platform-api/platform-search-filters), and [experimental API policy](https://developers.glean.com/experimental/overview).
