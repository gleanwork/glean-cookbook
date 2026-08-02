# Glean Cookbook

Runnable, copy-paste-able examples of building on the [Glean platform](https://developers.glean.com) — the Indexing API, Platform API, Web SDK, Connector SDK, MCP, and Agents. This repo is the code companion to the **Cookbooks** section of [developers.glean.com](https://developers.glean.com): every recipe published there has its full, tested source here.

> **Status:** private, pre-launch. This repo goes public alongside the Cookbooks section launch at Glean Go (targeting Aug 26–27, 2026). Until then, treat it as internal-only — do not link to it from public docs or share the URL externally.

## How this repo is organized

```
recipes/{id}/       one directory per recipe, self-contained and runnable
acme-corpus/        the seed dataset every recipe's demo queries resolve against
brand/              the Acme Corp brand kit shared by every recipe and mock
registry.json        the manifest — one entry per recipe, validated in CI
schemas/            recipe.schema.json, generated from developers.glean.com
```

### Recipe directory convention

Each `recipes/{id}/` directory is a **self-contained, runnable example** — it should work if someone clones just that directory (plus repo-root env var docs) into a fresh project. Conventions:

- **Language subdirectories** where a recipe ships more than one client (e.g. `recipes/permissions-aware-rag/python/`, `recipes/permissions-aware-rag/typescript/`).
- **A `README.md` per recipe** — the quickstart for someone browsing GitHub directly. Prose lives on the dev site page instead (see below); recipes with no standalone runnable code (e.g. `build-engineering-portal/`, `embed-search-chat/`) still get a directory with a short README explaining why.
- **No hardcoded credentials, ever.** All recipes read `GLEAN_INSTANCE` and `GLEAN_API_TOKEN` (or the recipe-specific scoped token) from the environment. Include a `.env.example` if the recipe needs more than those two.
- **Pinned dependencies.** Glean SDKs (`glean-api-client`, `@gleanwork/api-client`, `@gleanwork/web-sdk`, `glean-indexing-sdk`) are pinned to an exact released version — no `^`, `~`, or `latest`. CI (`pinned-deps`) fails a recipe that isn't: `scripts/check-pinned-deps.mjs` covers `package.json`/`requirements.txt`, and `scripts/check_pinned_deps.py` covers Python recipes that declare dependencies inline, reading the specifiers uv parsed into each `<script>.py.lock` rather than re-implementing PEP 723 in JavaScript.
- **Locked transitively.** Python recipes using inline dependencies commit a `<script>.py.lock` from `uv lock --script`. An exact direct pin still leaves dependencies-of-dependencies floating; the lock pins the full tree with hashes, so a recipe verified months ago still installs what it was verified with. `recipe-checks` runs `uv lock --check` and installs with `--locked`. Re-run `uv lock --script <script>` after editing inline dependencies.

### The registry

Recipe metadata is authored **one file per recipe**, at `recipes/{id}/recipe.json` — title,
description, sidebar label, prerequisites, `aiPrompt`, everything a recipe's dev site page or the
`glean-cookbook` plugin needs (see `schemas/recipe.schema.json`, generated from
[`src/types/recipe.ts`](https://github.com/gleanwork/glean-developer-site/blob/main/src/types/recipe.ts)
in the dev site repo). Keeping it next to the code it describes means adding a recipe touches only
its own directory, so two recipes in flight don't collide in one file.

`registry.json` at the repo root is **generated** from those files by `npm run build:registry`, and
committed: the dev site syncs it as a single fetch, and the plugin's skills are generated from it.
Don't hand-edit it — CI fails if it's out of sync with the `recipe.json` files. The dev site's
`docs/cookbook/{id}.mdx` files are prose-only — no metadata frontmatter — and are matched to their
recipe by filename === `id`.

Adding a recipe means adding all three:

1. `recipes/{id}/` with the runnable code (or a short README explaining why there isn't any)
2. `recipes/{id}/recipe.json`, then `npm run build:registry` to refresh `registry.json`
3. a prose page at `docs/cookbook/{id}.mdx` in [glean-developer-site](https://github.com/gleanwork/glean-developer-site)

CI (`validate-registry`) checks every `recipe.json` against the schema, confirms its `recipes/{id}/`
directory exists, and confirms `registry.json` matches what the recipe files build to. The dev site
pulls the built registry via `pnpm registry:sync` (fetched into its own `data/cookbook-registry.json`
snapshot, then compiled by `pnpm recipes:compile`) — run both there after changing a recipe here, or
wait for the `sync-cookbook-registry` CI workflow to open a PR automatically.

## CI

Every PR runs:

1. **`validate-registry`** — registry entries validate against `schemas/recipe.schema.json`, plus an informational (non-failing) report of which recipes are due for re-verification (see below).
2. **`pinned-deps`** — every recipe's Glean SDK dependency is pinned to an exact version.
3. **`recipe-checks`** — each recipe with a `package.json` typechecks (`tsc --noEmit`); each with a `requirements.txt` lints with `ruff`.
4. **`format-check`** — Prettier formatting.
5. **`plugin-build`** — the `glean-cookbook` plugin (see `plugin/`) builds and validates for every target (Claude Code, Cursor, Codex), and its generated skills are checked against `registry.json` for drift.

## Contributing

- Open a PR against `main`; one approving review is required.
- Run `npm run format` and `npm run validate:registry` locally before pushing.
- If you're building a recipe from a spec handed to you (e.g. a Linear ticket with a validated registry entry attached), the entry is normative — copy it into `registry.json` unchanged, and build the code in `recipes/{id}/` to match what it promises (demo queries must resolve against real data in `acme-corpus/`, `aiPrompt` must actually scaffold what it claims to).

### Verifying a recipe

What "verify" means depends on the recipe's `buildMethod`:

- **`scaffold`** recipes render from `steps`, not a hand-written `aiPrompt` — building one means
  running the recipe's own literal, checked commands (a `tiged` copy or a real CLI invocation),
  not regenerating code from prose. There's no drift for an LLM to introduce in that part. What
  still needs a real run is the recipe's own `## Verify` step and, where one exists, its `verify`
  script (e.g. `recipes/acme-answers/chat-api/scripts/verify.mjs`) — against a live Glean instance,
  with real credentials, asserting the exact behavior `demoQueries[].expectedBehavior` promises.
- **`integrate`** and **`third-party-build`** recipes still drive off a hand-written `aiPrompt` —
  this is where genuine regeneration-from-prose happens, and where drift (a stale response shape,
  a deprecated field) can hide undetected between runs.

For the second group especially, verify with a **genuinely fresh build, not inspect-and-patch**:
spawn an isolated agent (a fresh subagent, or a scratch git worktree) whose _only_ input is the
generated skill at `plugin/plugins/cookbook/skills/{id}/SKILL.md` — the same content a real
`/cookbook:{id}` invocation gets. Do not hand it the existing `recipes/{id}/` code to read and
patch; that only ever confirms "the code I'm already looking at still basically works," and misses
the case where the _skill_ is what's wrong, not the reference code. A blind rebuild catches drift
in either direction. Then run the recipe's demo queries against a real, live Glean instance and
confirm each one's `expectedBehavior` actually holds — not that the prose still reads correctly.

### The verify gate

`npm run verify:recipe <recipe-id>` is the executable form of a recipe's `## Verify` section. It
reads the queries from `recipes/<id>/recipe.json`'s `demoQueries` — never restates them — and runs
each one against a live instance, so adding a query to the registry adds it to verification.
`expectedBehavior` stays prose for humans; the executable assertion lives in
`scripts/verify/<id>.mjs`, the only per-recipe part.

It requires real credentials and **fails rather than skipping** when they're absent: a verify run
that quietly skips reports success for an unverified recipe, which is worse than no gate at all.
Each module declares the environment it needs, so a run stops with a list of what to set.

Two recipes have no module by design. `buildMethod: 'third-party-build'` means the app is built and
run by Lovable or Replit, so there is nothing of ours to drive — the driver prints the manual
checklist (each `demoQuery` with its `expectedBehavior`) for a human to walk instead.

`integrate` recipes ship no code either, so theirs verify the platform behaviour the recipe tells
readers to build on, not a reader's integration. If those fail, the recipe is pointing people at
something that doesn't work.

Once you've done that, set `lastVerified` to that date in the recipe's registry entry. Don't wait
for manual initiative to decide when a recipe is due: `npm run check:freshness` (also runs in CI,
informational only) reports which recipes have never been verified this way, or haven't been
re-checked in 90+ days — treat either as the trigger to schedule a fresh-build pass. It does not
currently detect a recipe whose `aiPrompt`/`llmContext` changed _without_ a fresh `lastVerified`
bump — if you edit either field, bump `lastVerified` back to `unset` (or schedule the re-run
yourself) rather than relying on the freshness report to notice for you.

## Related

- [developers.glean.com/cookbook](https://developers.glean.com/cookbook) — the published recipes (behind a feature flag pre-launch)
- [glean-developer-site](https://github.com/gleanwork/glean-developer-site) — the dev site repo; owns the recipe schema and MDX pages
- Linear project: **Glean Cookbook (GO)** (team PACT) — tracks every recipe, the brand kit, the corpus, and the `glean-cookbook` plugin
