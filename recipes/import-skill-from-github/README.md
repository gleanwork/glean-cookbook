# Import a skill from GitHub

Preview a pinned public GitHub skill, import the selected URL, sync that
captured skill, confirm it with `get` / `list`, then delete only IDs this run
created.

The Skills API stores and distributes bundles. It does not execute them. Local
first persist and version supersession are different recipes.

## Run

```bash
npm install
npm test
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
```

The default source is the OpenAPI fixture URL:

`https://github.com/anthropics/skills/tree/main/skills/skill-creator`

Use `--stream` to request repository scan progress as server-sent events. If
this tenant cannot fetch GitHub, verification fails instead of skipping.

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure. You may instead set `GLEAN_API_TOKEN` and
`GLEAN_SERVER_URL` for a user-scoped token.
