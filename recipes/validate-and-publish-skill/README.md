# Validate and publish a skill

Validate a local `SKILL.md` and persist it once with the official TypeScript
SDK. `npm start` uses `fixtures/sample-skill/SKILL.md` by default (or pass
`--bundle` with your own file). `npm run verify` generates a unique name,
confirms `list` / `get` / latest content, then deletes only the ID returned by
that run.

The Skills API stores and distributes bundles. It does not execute them. This
quickstart does not version a skill, unpack a zip, or import from GitHub.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants `skills:read` and `skills:write`, the legacy `SKILLS`
  compatibility scope, or a user-scoped token

Skills are still experimental and may not be enabled on every tenant.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill
cd validate-and-publish-skill
npm install
npm test
```

The test run uses fixtures and does not need Glean credentials. It ends with a
passing Vitest summary.

## Authenticate and run

OAuth is the default:

```bash
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
npm start -- --email you@example.com --yes
```

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure.

For a token-first tenant, skip login and put the fallback beside the rest of
your setup:

```bash
cp .env.example .env
# Set GLEAN_SERVER_URL and a user-scoped GLEAN_API_TOKEN in .env.
npm run verify
```

The verify run prints a final `Verified ...; cleanup completed.` line and
deletes only the skill ID it created.
