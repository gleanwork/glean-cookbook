# Import a skill from GitHub

Preview a public GitHub skill on the `main` branch, import it into your Glean
instance, and sync the imported copy with its source.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- Permission to import, sync, and delete skills using the `SKILLS` OAuth scope
  or the `SKILLS` permission on a user-scoped token
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

## Sign in with dynamic client registration

The official auth package discovers your instance, registers the OAuth client
dynamically, and stores credentials securely.

```bash
npm run login -- --email you@example.com
```

Complete authorization in your browser and wait for the command to report
success.

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
branch or tag URL. `HTTP 400` means that source URL or ref is unsupported, not
that Third-party skills need to be enabled. `HTTP 503` means GitHub import is
disabled or unavailable. `HTTP 403` means this credential cannot import from
GitHub. `HTTP 429` means the import is rate-limited. Verification fails instead
of skipping.

To request the streaming preview, run:

```bash
npm start -- --email you@example.com --yes --stream
```

This command prints any scan events returned by the API, then follows the same
import, sync, and captured-ID cleanup path. A small source may return only the
final result event.
