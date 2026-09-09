# Skill publishing pipeline

Publish a new version of a skill bundle, retrieve that exact version from
Glean, and inspect the downloaded files safely before you use them elsewhere.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants Skills read and write access through OAuth or a
  user-scoped token

Skills are still experimental and may not be enabled on every tenant. This
recipe stores and downloads bundles; it does not run their contents.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/skill-publishing-pipeline skill-publishing-pipeline
cd skill-publishing-pipeline
npm install
npm test
```

You test versioning and archive safety with fixtures, so you do not need Glean
credentials yet. A successful run ends with:

```text
Test Files  4 passed (4)
Tests       17 passed (17)
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

## Verify version publishing

```bash
npm run verify -- --email you@example.com
```

You should see `Verified …; cleanup completed.` The command publishes a unique
sample twice under one name, retrieves the new version, and deletes only the
skill ID it created. It checks the downloaded files in a temporary directory
and removes that directory silently, so `verify` leaves nothing under
`staged/`.

## Publish your bundle

The publish command defaults to `fixtures/sample-skill/SKILL.md`:

```bash
npm start -- publish --email you@example.com
```

Pass `--bundle path/to/SKILL.md` to publish your own bundle. Unlike `verify`,
this command keeps the downloaded version under
`staged/<skill-id>/v<version>.<minor>/`; use `--stage-dir` to choose another
parent.

The sandbox treats downloaded bundles as untrusted. It rejects unsafe archives,
refuses to overwrite an existing folder, and never executes retrieved content.
