# Search Glean with discovered filters

This TypeScript CLI discovers the datasources and common filter fields visible to you, requests query-specific suggested values for one datasource, and applies the selection to a Platform Search request.

The Platform Search APIs are experimental. The client sends `X-Glean-Include-Experimental: true` on every request.

## Run

```bash
npm install
npm run login -- --email "you@company.com"
npm start -- --query "quarterly planning"
```

The interactive flow:

1. Lists datasource identifiers and common fields from `GET /api/search/filters`.
2. Requests suggested values for your query and chosen datasource.
3. Applies the datasource and an available field/value to `POST /api/search`.
4. Prints results, warnings, pagination state, and the request ID.

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
