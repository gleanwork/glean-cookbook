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

To publish a new version of your own bundle (the scaffold sample is
`fixtures/sample-skill/SKILL.md`):

```bash
npm start -- publish --bundle fixtures/sample-skill/SKILL.md --email you@example.com
```

Each version stages under `staged/<skill-id>/v<version>.<minor>/`. Pass
`--stage-dir` to choose a different parent. The sandbox still refuses to
overwrite an existing folder.

The CLI stages downloaded zip content with restrictive permissions. It rejects
unsafe archive paths, links, special files, overwrites, and oversized bundles.
It never executes retrieved content.

If native `skills:read` and `skills:write` OAuth scopes are unavailable, the
login wrapper retries with legacy `SKILLS` only when the authorization failure
is specifically a scope-grant failure. You may instead copy `.env.example` to
`.env` and set `GLEAN_API_TOKEN` and `GLEAN_SERVER_URL` for a user-scoped token,
or export those variables in the shell.
