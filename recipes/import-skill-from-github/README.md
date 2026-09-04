# Import a skill from GitHub

Preview a public GitHub skill at a commit SHA, import the selected URL, sync
that captured skill, confirm it with `get` / `list`, then delete only IDs this
run created.

The Skills API stores and distributes bundles. It does not execute them. Local
first persist and version supersession are different recipes.

## Run

```bash
npm install
npm test
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
```

The default source is the public skill-creator directory at commit
`41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`:

`https://github.com/anthropics/skills/tree/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/skill-creator`

`npm start -- --yes --stream` is the SSE variant of the same import. Both
commands delete the captured skill when they finish. Pass `--yes` when the
terminal is not interactive.

If this tenant cannot fetch GitHub, verification fails instead of skipping.

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure. You may instead copy `.env.example` to
`.env` and set `GLEAN_API_TOKEN` and `GLEAN_SERVER_URL` for a user-scoped token,
or export those variables in the shell.
