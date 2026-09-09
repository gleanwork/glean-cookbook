# Import a skill from GitHub

Preview a public GitHub skill at a pinned commit, import it into your Glean
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
Tests       21 passed (21)
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

## Import the pinned skill

```bash
npm run verify -- --email you@example.com
```

The command previews the public `skill-creator` directory at commit
`41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`, imports it, confirms the stored
skill, syncs it, and deletes only the ID it created. You should see:

```text
Imported skill-creator (…) from … at …; cleanup completed.
```

The pinned source is:

`https://github.com/anthropics/skills/tree/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/skill-creator`

The pinned commit and `SKILL.md` were confirmed public and reachable on
2026-09-09. If the pinned URL returns `HTTP 400: GitHub source could not be
previewed`, the request reached the Skills API but that tenant could not use
GitHub source fetching. Ask your Glean administrator or support contact to
confirm that GitHub-backed Skills import is enabled. Verification fails instead
of skipping; changing to an unpinned branch does not fix tenant-side fetching.

To watch repository scan progress, run:

```bash
npm start -- --email you@example.com --yes --stream
```

This streaming command follows the same import, sync, and captured-ID cleanup
path.
