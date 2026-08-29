# Search Glean with discovered filters

This TypeScript CLI uses the official `@gleanwork/api-client` to discover the datasources and common filter fields visible to you, request query-specific suggested values for one datasource, and apply the selection to Platform Search.

The Platform Search APIs are experimental. The SDK sends `X-Glean-Include-Experimental: true` when the recipe enables its documented experimental-feature option through `X_GLEAN_INCLUDE_EXPERIMENTAL`.

## Run

```bash
npm install
npm run login -- --email "you@company.com"
npm start -- --query "quarterly planning"
```

The core calls are the generated, typed SDK methods:

```ts
const { result: filters } = await glean.search.listFilters();
const response = await glean.search.query({
  query: 'quarterly planning',
  datasources: [filters.datasources[0].datasource],
});
```

The interactive flow:

1. Calls `glean.search.listFilters()` to list datasource identifiers and common fields.
2. Calls `glean.search.listFilters([datasource], query)` for suggested values.
3. Applies the datasource and an available field/value through `glean.search.query()`.
4. Prints typed results, warnings, pagination state, and the request ID.

For a deterministic non-interactive run, provide the values explicitly:

```bash
npm start -- --query "quarterly planning" --datasource jira --field status --value "In Progress"
```

Run fixture tests without credentials:

```bash
npm test
```

Verify against your Glean instance after signing in:

```bash
npm run verify -- --query "a topic you know exists"
```

See the [Platform Search API](https://developers.glean.com/api/platform-api/search-overview), [Search Filters reference](https://developers.glean.com/api/platform-api/platform-search-filters), and [experimental API policy](https://developers.glean.com/experimental/overview).
