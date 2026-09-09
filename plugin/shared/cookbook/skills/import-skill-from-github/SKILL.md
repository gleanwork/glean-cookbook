---
name: import-skill-from-github
description: 'Preview a public GitHub skill on a branch URL with the official TypeScript API client, import the selected URL, sync that captured skill, confirm it with get and list, then delete only IDs this run created.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that permits the native skills:read and skills:write OAuth scopes; the legacy SKILLS compatibility scope or a user-scoped token is the fallback
- Tenant-side GitHub source fetching enabled for Skills; the default source is the public skill-creator directory on main, and verification fails rather than skipping if the tenant cannot preview it

Build "Import a skill from GitHub" following https://developers.glean.com/cookbook/import-skill-from-github

{{> ask-setup-questions}}

- What is your work email address?

{{> oauth-setup}}

1. **Copy the project onto your machine**
   Copy the runnable TypeScript GitHub import CLI and credential-free MSW fixture tests into a new directory. OAuth login and secure token storage come from the pinned @gleanwork/auth package.

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/import-skill-from-github import-skill-from-github
   ```

2. **Install dependencies**

   ```bash
   cd import-skill-from-github && npm install
   ```

3. **Run the fixture tests**
   Run Vitest with recorded preview payloads and MSW, without GitHub or Glean credentials, covering JSON preview, optional SSE preview, import, sync, and captured-ID cleanup.

   ```bash
   cd import-skill-from-github && npm test
   ```

4. **Sign in with OAuth**
   Discover your Glean backend from work email and request skills:read and skills:write. Only a recognized scope-grant failure triggers one retry with legacy SKILLS. If OAuth is not available, skip this command: copy .env.example to .env and fill GLEAN_API_TOKEN and GLEAN_SERVER_URL.

   ```bash
   cd import-skill-from-github && npm run login -- --email "<work-email>"
   ```

5. **Pass an explicit backend if you need one**
   If email discovery is wrong, pass --server-url with the complete Glean backend HTTPS origin on login, verify, and start. If DCR is restricted, export GLEAN_OAUTH_CLIENT_ID in your shell before npm run login. npm run login does not read .env, so do not store that client id only in .env.

6. **Verify against your instance**
   Preview the public GitHub skill-creator directory on main, import the selected URL, sync that captured skill, confirm get and list, then permanently delete only IDs this run created. HTTP 400 means an unsupported GitHub URL or ref, including commit permalinks. HTTP 503 means GitHub import is disabled or unavailable. HTTP 403 means this credential cannot import. HTTP 429 means rate-limiting. Success prints an Imported line that ends with cleanup completed.

   ```bash
   cd import-skill-from-github && npm run verify -- --email "<work-email>"
   ```

7. **Watch repository scan progress**
   Run the same preview, import, and sync path with --stream. Scan events print as the tenant walks the GitHub directory. This command still deletes the captured skill when it finishes; there is no keep path. Pass --yes when the terminal is not interactive.
   ```bash
   cd import-skill-from-github && npm start -- --email "<work-email>" --yes --stream
   ```
   {{> run-cli}}
