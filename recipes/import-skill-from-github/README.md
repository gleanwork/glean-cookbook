# Import a skill from GitHub

Preview a public GitHub skill at a commit SHA, import the selected URL, sync
that captured skill, confirm it with `get` / `list`, then delete only IDs this
run created.

The Skills API stores and distributes bundles. It does not execute them. Local
first persist and version supersession are different recipes.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants `skills:read` and `skills:write`, the legacy `SKILLS`
  compatibility scope, or a user-scoped token
- Tenant-side GitHub source fetching enabled for Skills

Skills are still experimental and may not be enabled on every tenant.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/import-skill-from-github import-skill-from-github
cd import-skill-from-github
npm install
npm test
```

The test run uses recorded preview responses and does not need GitHub or Glean
credentials. It ends with a passing Vitest summary.

## Authenticate and verify

OAuth is the default:

```bash
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
```

The default source is the public skill-creator directory at commit
`41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`:

`https://github.com/anthropics/skills/tree/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/skill-creator`

`npm start -- --yes --stream` is the SSE variant of the same import. Both
commands delete the captured skill when they finish. Pass `--yes` when the
terminal is not interactive.

The pinned commit and `SKILL.md` were confirmed public and reachable on
2026-09-09. If the pinned URL returns `HTTP 400: GitHub source could not be
previewed`, the request reached the Skills API but that tenant could not use
GitHub source fetching. Ask your Glean administrator or support contact to
confirm that GitHub-backed Skills import is enabled. Verification fails instead
of skipping; changing to an unpinned branch does not fix tenant-side fetching.

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure.

For a token-first tenant, skip login:

```bash
cp .env.example .env
# Set GLEAN_SERVER_URL and a user-scoped GLEAN_API_TOKEN in .env.
npm run verify
```
