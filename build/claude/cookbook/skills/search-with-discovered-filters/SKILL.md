---
name: search-with-discovered-filters
description: 'Use the official TypeScript API client to search across all of your Glean content by default, or discover datasources and common filter fields before applying an explicit selection to permission-aware Platform Search.'
disable-model-invocation: true
---

## Before you start

- Node 22.12.0 or newer
- A Glean instance with content indexed
- Your work email, or the complete Glean backend origin shown under Server instance (QE)
- A tenant that permits this public OAuth client and search scope through DCR; an administrator-provisioned OAuth client or user-scoped SEARCH token is the fallback
- Experimental Platform APIs enabled through the SDK's includeExperimental constructor option, which the scaffold sets automatically

Build "Search Glean with discovered filters" following https://developers.glean.com/cookbook/search-with-discovered-filters

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email address?
- What topic do you know exists in your Glean content?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**
   Copies the runnable TypeScript Search CLI and fixture tests into a new directory. OAuth login and secure token storage come from the pinned @gleanwork/auth package.

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/search-with-discovered-filters search-with-discovered-filters
   ```

2. **Install dependencies**

   ```bash
   cd search-with-discovered-filters && npm install
   ```

3. **Run the fixture tests**
   Runs the Vitest fixture suite without credentials or network access, covering catalog discovery, query-backed suggestions, retries, typed errors, field-filter propagation, and experimental headers.

   ```bash
   cd search-with-discovered-filters && npm test
   ```

4. **Sign in with OAuth**
   Discovers your Glean backend from work email, completes Authorization Code with PKCE for search and offline_access, and stores refreshable credentials outside the project. Use --server-url for an explicit backend, GLEAN_OAUTH_CLIENT_ID for an administrator-provisioned public client, or GLEAN_API_TOKEN as a user-scoped fallback.

   ```bash
   cd search-with-discovered-filters && npm run login -- --email "<work-email>"
   ```

5. **Verify against your instance**
   Searches your topic across all datasources and validates the Search response shape and pagination state. Add --pages 2 to fetch a second page, --datasources to narrow the query, or --auto-select to exercise the discovered datasource and suggested-filter path.

   ```bash
   cd search-with-discovered-filters && npm run verify -- --email "<work-email>" --query "<search-query>"
   ```

6. **Discover filters and search**
   Runs the non-interactive CLI path, selecting the first returned datasource and suggested field value, then prints results, warnings, pagination state, and request IDs. Add --pages 2 to fetch the next result page. Omit --auto-select when running interactively to choose them yourself.
   ```bash
   cd search-with-discovered-filters && npm start -- --email "<work-email>" --query "<search-query>" --auto-select --pages 2
   ```
   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.
