# Validate and publish a skill

Validate a local `SKILL.md` and persist it once with the official TypeScript
SDK. The first run creates a uniquely named skill, confirms `list` / `get` /
latest content, then deletes only the ID returned by that run.

The Skills API stores and distributes bundles. It does not execute them. This
quickstart does not version a skill, unpack a zip, or import from GitHub.

## Run

```bash
npm install
npm test
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
```

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure. You may instead set `GLEAN_API_TOKEN` and
`GLEAN_SERVER_URL` for a user-scoped token.
