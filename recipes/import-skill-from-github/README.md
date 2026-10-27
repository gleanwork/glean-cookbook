# Import a skill from GitHub

Preview a public GitHub skill on the `main` branch, import it into your Glean
instance, and sync the imported copy with its source.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with Skills enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants Skills read and write access through OAuth or a
  user-scoped token
- Tenant-side GitHub source fetching enabled for Skills

This recipe stores and syncs the bundle; it does not run retrieved files.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/import-skill-from-github import-skill-from-github
cd import-skill-from-github
npm ci
npm test
```

You test with recorded preview responses, so you do not need GitHub or Glean
credentials yet. A successful run ends with:

```text
Test Files  3 passed (3)
Tests       23 passed (23)
```

## Sign in

Sign in with OAuth so the API calls use your own permissions:

```bash
npm run login -- --email you@example.com
```

The official `glean-auth` CLI requests `skills:read` and `skills:write`, and the
auth package stores refreshable credentials outside this project. If your tenant
does not grant those OAuth scopes, use a user-scoped token with Skills read and
write permission instead; the recipe does not retry with a legacy scope.

For a token-first tenant, skip login:

```bash
cp .env.example .env
# Set GLEAN_SERVER_URL and a user-scoped GLEAN_API_TOKEN in .env.
```

When you use `.env`, omit `--email` from the commands below.

## Import the public skill

```bash
npm run verify -- --email you@example.com
```

The command previews the public `skill-creator` directory on `main`, imports
it, confirms the stored skill, syncs it, and deletes only the ID it created.
You should see:

```text
Imported skill-creator (…) from … at …; cleanup completed.
```

The default source is:

`https://github.com/anthropics/skills/tree/main/skills/skill-creator`

GitHub commit permalinks and 40-character SHA URLs are not supported. Use a
branch or tag URL. Glean records the resolved commit SHA, and later sync follows
the stored branch or tag, which can advance. `HTTP 400` means that source URL or
ref is unsupported, not that Third-party skills need to be enabled. `HTTP 403`
means the workspace or credential lacks permission for the Skills operation.
`HTTP 503` means GitHub import is disabled or unavailable. `HTTP 429` means the
import is rate-limited. Verification fails instead of skipping.

To watch repository scan progress, run:

```bash
npm start -- --email you@example.com --yes --stream
```

This streaming command follows the same import, sync, and captured-ID cleanup
path.
