# Validate and publish a skill

Validate a local `SKILL.md` and persist it once with the official TypeScript
SDK. `npm start` uses `fixtures/sample-skill/SKILL.md` by default (or pass
`--bundle` with your own file). `npm run verify` generates a unique name,
confirms `list` / `get` / latest content, then deletes only the ID returned by
that run.

The Skills API stores and distributes bundles. It does not execute them. This
quickstart does not version a skill, unpack a zip, or import from GitHub.

## Run

```bash
npm install
npm test
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
npm start -- --email you@example.com --yes
```

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure. You may instead copy `.env.example` to
`.env` and set `GLEAN_API_TOKEN` and `GLEAN_SERVER_URL` for a user-scoped token,
or export those variables in the shell.
