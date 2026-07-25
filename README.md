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
- **Pinned dependencies.** Glean SDKs (`glean-api-client`, `@gleanwork/api-client`, `@gleanwork/web-sdk`, `glean-indexing-sdk`) are pinned to an exact released version — no `^`, `~`, or `latest`. CI (`pinned-deps`) fails a recipe that isn't.

### The registry

`registry.json` is the **single source of truth for recipe metadata** — title, description, sidebar label, prerequisites, `aiPrompt`, everything a recipe's dev site page or the `glean-cookbook` plugin needs (see `schemas/recipe.schema.json`, generated from [`src/types/recipe.ts`](https://github.com/gleanwork/glean-developer-site/blob/main/src/types/recipe.ts) in the dev site repo). The dev site's `docs/cookbook/{id}.mdx` files are prose-only — no metadata frontmatter — and are matched to their registry entry by filename === `id`.

Adding a recipe means adding all three:

1. `recipes/{id}/` with the runnable code (or a short README explaining why there isn't any)
2. an entry in `registry.json` with matching `id`
3. a prose page at `docs/cookbook/{id}.mdx` in [glean-developer-site](https://github.com/gleanwork/glean-developer-site)

CI (`validate-registry`) checks every registry entry against the schema and confirms its `recipes/{id}/` directory exists. The dev site pulls this registry via `pnpm registry:sync` (fetched into its own `data/cookbook-registry.json` snapshot, then compiled by `pnpm recipes:compile`) — run both there after changing `registry.json` here, or wait for the `sync-cookbook-registry` CI workflow to open a PR automatically.

## CI

Every PR runs:

1. **`validate-registry`** — registry entries validate against `schemas/recipe.schema.json`.
2. **`pinned-deps`** — every recipe's Glean SDK dependency is pinned to an exact version.
3. **`recipe-checks`** — each recipe with a `package.json` typechecks (`tsc --noEmit`); each with a `requirements.txt` lints with `ruff`.
4. **`format-check`** — Prettier formatting.

## Contributing

- Open a PR against `main`; one approving review is required.
- Run `npm run format` and `npm run validate:registry` locally before pushing.
- If you're building a recipe from a spec handed to you (e.g. a Linear ticket with a validated registry entry attached), the entry is normative — copy it into `registry.json` unchanged, and build the code in `recipes/{id}/` to match what it promises (demo queries must resolve against real data in `acme-corpus/`, `aiPrompt` must actually scaffold what it claims to).

## Related

- [developers.glean.com/cookbook](https://developers.glean.com/cookbook) — the published recipes (behind a feature flag pre-launch)
- [glean-developer-site](https://github.com/gleanwork/glean-developer-site) — the dev site repo; owns the recipe schema and MDX pages
- Linear project: **Glean Cookbook (GO)** (team PACT) — tracks every recipe, the brand kit, the corpus, and the `glean-cookbook` plugin
