# Import a skill from GitHub

Preview a public GitHub skill on the `main` branch, import it into your Glean
instance, and sync the imported copy with its source.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants Skills read and write access through OAuth or a
  user-scoped token
- Tenant-side GitHub source fetching enabled for Skills

Skills are still experimental and may not be enabled on every tenant. This
recipe stores and syncs the bundle; it does not run retrieved files.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/import-skill-from-github import-skill-from-github
cd import-skill-from-github
npm install
npm test
```

You test with recorded preview responses, so you do not need GitHub or Glean
credentials yet. A successful run ends with:

```text
Test Files  4 passed (4)
Tests       22 passed (22)
```

## Sign in

Sign in with OAuth so the API calls use your own permissions:

```bash
npm run login -- --email you@example.com
```

Your browser opens for approval, and the auth package stores your refreshable
credentials outside this project. If your tenant uses the older Skills
permission, the login command retries with that compatibility permission.

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

The Skills API rejects commit permalinks and SHA-pinned GitHub URLs. If you
see `HTTP 400: GitHub source could not be previewed`, the source shape was
rejected or tenant policy still blocks GitHub import. `HTTP 503` means GitHub
fetch is temporarily unavailable; retry later. Verification fails instead of
skipping.

To watch repository scan progress, run:

```bash
npm start -- --email you@example.com --yes --stream
```

This streaming command follows the same import, sync, and captured-ID cleanup
path.
