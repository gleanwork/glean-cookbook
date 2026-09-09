# Validate and publish a skill

Publish a local `SKILL.md` to your Glean instance, read it back, and confirm
that its stored content matches what you sent.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that grants Skills read and write access through OAuth or a
  user-scoped token

Skills are still experimental and may not be enabled on every tenant. This
quickstart stores one bundle; it does not run the skill or create another
version.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill
cd validate-and-publish-skill
npm install
npm test
```

You test with fixtures, so you do not need Glean credentials yet. A successful
run ends with:

```text
Test Files  6 passed (6)
Tests       19 passed (19)
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

## Verify against your instance

```bash
npm run verify -- --email you@example.com
```

You should see `Verified …; cleanup completed.` The command creates a uniquely
named sample, reads it back, and deletes only the skill ID it created.

To publish the included sample through the same create-and-clean-up path, run:

```bash
npm start -- --email you@example.com --yes
```

Pass `--bundle path/to/SKILL.md` to use your own file.
