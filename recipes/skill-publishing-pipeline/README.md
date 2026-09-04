# Skill publishing pipeline

Prove name-based version supersession with the official TypeScript SDK. After a
first persist, this recipe publishes the same unique name twice, retrieves the
new version directly, stages the zip in a bounded sandbox, then deletes only
the ID returned by that run.

The Skills API stores and distributes bundles. It does not execute them. The
Beginner `validate-and-publish-skill` quickstart owns the first persist. GitHub
import and sync are a different recipe.

## Run

```bash
npm install
npm test
npm run login -- --email you@example.com
npm run verify -- --email you@example.com
```

To publish a new version of your own bundle:

```bash
npm start -- publish --bundle path/to/SKILL.md --email you@example.com
```

The CLI stages downloaded zip content under `staged/` with restrictive
permissions. It rejects unsafe archive paths, links, special files, overwrites,
and oversized bundles. It never executes retrieved content.

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure. You may instead set `GLEAN_API_TOKEN` and
`GLEAN_SERVER_URL` for a user-scoped token.
