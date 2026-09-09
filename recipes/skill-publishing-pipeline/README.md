# Skill publishing pipeline

Prove name-based version supersession with the official TypeScript SDK. After a
first persist, this recipe publishes the same unique name twice, retrieves the
new version directly, stages the zip in a bounded sandbox, then deletes only
the ID returned by that run.

The Skills API stores and distributes bundles. It does not execute them. The
Beginner `validate-and-publish-skill` quickstart owns the first persist. GitHub
import and sync are a different recipe.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants `skills:read` and `skills:write`, the legacy `SKILLS`
  compatibility scope, or a user-scoped token

Skills are still experimental and may not be enabled on every tenant.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/skill-publishing-pipeline skill-publishing-pipeline
cd skill-publishing-pipeline
npm install
npm test
```

The test run uses fixtures and does not need Glean credentials. It ends with a
passing Vitest summary.

## Authenticate and verify

OAuth is the default:

```bash
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
```

For a token-first tenant, skip login:

```bash
cp .env.example .env
# Set GLEAN_SERVER_URL and a user-scoped GLEAN_API_TOKEN in .env.
npm run verify
```

The verify command publishes a unique fixture twice, stages the downloaded
version in a temporary directory, checks it, deletes that temporary directory,
and deletes only the skill ID it created. It does not leave output under
`staged/`.

To publish a new version of your own bundle (`npm start -- publish` defaults to
`fixtures/sample-skill/SKILL.md`):

```bash
npm start -- publish --email you@example.com
```

Unlike verify, `npm start -- publish` keeps its downloaded output. Each publish
stages under `staged/<skill-id>/v<version>.<minor>/`. Pass `--stage-dir` to
choose a different parent. The sandbox still refuses to overwrite an existing
folder.

The CLI stages downloaded zip content with restrictive permissions. It rejects
unsafe archive paths, links, special files, overwrites, and oversized bundles.
It never executes retrieved content.

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure.
