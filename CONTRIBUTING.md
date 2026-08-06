# Contributing

Open a PR against `main`; one approving review is required.

Before pushing, run:

```bash
npm run format
npm run validate:registry
npm run build
```

`npm run build` refreshes both `registry.json` and the plugin's committed output, and CI fails if
either is stale.

## Setup

```bash
npm ci
npm --prefix plugin ci   # once — the plugin is its own npm project with its own lockfile
```

## Adding a recipe

Adding a recipe means adding all three:

1. `recipes/{id}/` with the runnable code (or a short README explaining why there isn't any)
2. `recipes/{id}/recipe.json`, then `npm run build`
3. a prose page at `docs/cookbook/{id}.mdx` in [glean-developer-site](https://github.com/gleanwork/glean-developer-site)

Use `npm run build`, not `npm run build:registry` alone. The plugin's skills are generated from
`registry.json` and its output is committed, so a registry-only build leaves `/cookbook:{id}`
describing the previous state of the recipe — which is what users actually get.

If you're building a recipe from a spec handed to you (e.g. a Linear ticket with a validated registry
entry attached), the entry is normative — copy it in unchanged and build the code to match what it
promises. Demo queries must be answerable on a reader's own instance, and `aiPrompt` must actually
scaffold what it claims to.

## Recipe directory conventions

Each `recipes/{id}/` directory is a **self-contained, runnable example** — it should work if someone
clones just that directory (plus repo-root env var docs) into a fresh project.

- **Language subdirectories** where a recipe ships more than one client (e.g.
  `recipes/permissions-aware-retrieval/python/`, `.../typescript/`).
- **A `README.md` per recipe** — the quickstart for someone browsing GitHub directly. Prose lives on
  the dev site page instead. Recipes with no standalone runnable code (e.g.
  `build-engineering-portal/`, `embed-search-chat/`) still get a directory with a short README
  explaining why.
- **No hardcoded credentials, ever.** All recipes read `GLEAN_INSTANCE` and `GLEAN_API_TOKEN` (or the
  recipe-specific scoped token) from the environment. Include a `.env.example` if the recipe needs
  more than those two.
- **Pinned dependencies.** Glean SDKs (`glean-api-client`, `@gleanwork/api-client`,
  `@gleanwork/web-sdk`, `glean-indexing-sdk`) are pinned to an exact released version — no `^`, `~`,
  or `latest`. CI (`pinned-deps`) fails a recipe that isn't, for both npm and Python (including PEP
  723 inline dependencies).
- **Locked transitively.** Python recipes using inline dependencies commit a `<script>.py.lock` from
  `uv lock --script`. An exact direct pin still leaves dependencies-of-dependencies floating; the
  lock pins the full tree with hashes, so a recipe verified months ago still installs what it was
  verified with. Re-run `uv lock --script <script>` after editing inline dependencies.

## The registry

Recipe metadata is authored **one file per recipe**, at `recipes/{id}/recipe.json` — title,
description, prerequisites, `aiPrompt`, everything a recipe's dev site page or the `glean-cookbook`
plugin needs. The shape is `schemas/recipe.schema.json`, generated from
[`src/types/recipe.ts`](https://github.com/gleanwork/glean-developer-site/blob/main/src/types/recipe.ts)
in the dev site repo.

`registry.json` at the repo root is **generated** from those files and committed — the dev site syncs
it as a single fetch, and the plugin's skills are generated from it. Don't hand-edit it; CI fails if
it's out of sync with the `recipe.json` files.

The dev site pulls the built registry with `pnpm registry:sync` then `pnpm recipes:compile` — run
both there after changing a recipe here, or wait for the `sync-cookbook-registry` workflow to open a
PR automatically. Its `docs/cookbook/{id}.mdx` files are prose-only and matched to their recipe by
filename === `id`.

## Verifying a recipe

What "verify" means depends on the recipe's `buildMethod`:

- **`scaffold`** recipes render from `steps`, not a hand-written `aiPrompt` — building one means
  running the recipe's own literal, checked commands (a `tiged` copy or a real CLI invocation), not
  regenerating code from prose. There's no drift for an LLM to introduce in that part. What still
  needs a real run is the recipe's own `## Verify` step and, where one exists, its `verify` script
  (e.g. `recipes/company-answers/chat-api/scripts/verify.mjs`).
- **`integrate`** and **`third-party-build`** recipes still drive off a hand-written `aiPrompt` —
  this is where genuine regeneration-from-prose happens, and where drift (a stale response shape, a
  deprecated field) can hide undetected between runs.

For the second group especially, verify with a **genuinely fresh build, not inspect-and-patch**:
spawn an isolated agent (a fresh subagent, or a scratch git worktree) whose _only_ input is the
generated skill at `plugin/plugins/cookbook/skills/{id}/SKILL.md` — the same content a real
`/cookbook:{id}` invocation gets. Do not hand it the existing `recipes/{id}/` code to read and patch;
that only ever confirms "the code I'm already looking at still basically works," and misses the case
where the _skill_ is what's wrong, not the reference code. A blind rebuild catches drift in either
direction. Then run the recipe's demo queries against a real, live Glean instance and confirm each
one's `expectedBehavior` actually holds — not that the prose still reads correctly.

### The verify gate

`npm run verify:recipe <recipe-id>` is the executable form of a recipe's `## Verify` section. It reads
the queries from `recipes/<id>/recipe.json`'s `demoQueries` — never restates them — so adding a query
to the registry adds it to verification. `expectedBehavior` stays prose for humans; the executable
assertion lives in `scripts/verify/<id>.mjs`, the only per-recipe part.

It requires real credentials and **fails rather than skipping** when they're absent: a verify run
that quietly skips reports success for an unverified recipe, which is worse than no gate at all. Each
module declares the environment it needs, so a run stops with a list of what to set.

Two recipes have no module by design. `buildMethod: 'third-party-build'` means the app is built and
run by Lovable or Replit, so there is nothing of ours to drive — the driver prints the manual
checklist (each `demoQuery` with its `expectedBehavior`) for a human to walk instead. `integrate`
recipes ship no code either, so theirs verify the platform behaviour the recipe tells readers to
build on, not a reader's integration. If those fail, the recipe is pointing people at something that
doesn't work.

Once you've verified, set `lastVerified` to that date in the recipe's registry entry.
`npm run check:freshness` (also runs in CI, informational only) reports which recipes have never been
verified this way, or haven't been re-checked in 90+ days — treat either as the trigger to schedule a
fresh-build pass.

It does **not** detect a recipe whose `aiPrompt`/`llmContext` changed without a fresh `lastVerified`
bump. If you edit either field, reset `lastVerified` to `unset` (or schedule the re-run yourself)
rather than relying on the freshness report to notice for you.

## Styling a recipe UI

Don't hand-roll CSS. Every recipe that renders a UI links one shared stylesheet:

```html
<link rel="stylesheet" href="/glean-cookbook.css" />
```

It carries the design tokens, a base reset, the grid/spacing utilities, and the primitives recipes
actually use — `.card`, `.pill`/`.badge`, `.note`, `.empty`, `.hit`, `.citations`, `.step`,
`.chat-row`/`.msg`, `.kpi`, `.frame` (the browser chrome the dev site wraps demos in), and the
`.layout*` shell. Compose those; add an inline `<style>` block only for something genuinely specific
to one recipe, and reach for a token (`var(--gdt-*)`, `var(--glean-border-radius-*)`) rather than a
literal when you do.

Two sources, both at the repo root:

| File                  | Owner                                               |
| --------------------- | --------------------------------------------------- |
| `styles/cookbook.css` | **Authored.** Edit this.                            |
| `styles/tokens.css`   | **Generated** by `npm run sync:tokens`. Never edit. |

`npm run build:styles` concatenates them into `recipes/*/public/glean-cookbook.css` and copies the
logomark alongside. Those copies are committed — a recipe is scaffolded one directory at a time with
`tiged`, so a file at the repo root would never reach it, and most recipes have no bundler to import
one. CI fails if a copy is stale.

Primitives are presentational and carry no copy. What an empty state _says_ is a per-recipe decision;
how it _looks_ is not.

### Keeping tokens matched to the developer site

The design tokens are the dev site's, not ours: `styles/tokens.css` is generated from the `--gdt-*`
block in [glean-developer-site](https://github.com/gleanwork/glean-developer-site)'s
`src/css/custom.css`, plus the radius/shadow scales from its theme package. That's what makes a recipe
and the Cookbook page describing it look like one product.

```bash
npm run sync:tokens                       # expects ../glean-developer-site
npm run sync:tokens -- --site <path>      # or GLEAN_DEVELOPER_SITE=<path>
npm run sync:tokens -- --check            # report drift without writing
```

This is a deliberate manual sync, not a CI check — the dev site isn't available in CI. Re-run it when
the brand changes. It fails loudly rather than guessing if the dev site introduces a token it can't
resolve, so a failure means read the message, not work around it.

## CI

Every PR runs:

1. **`validate-registry`** — every `recipe.json` validates against `schemas/recipe.schema.json`, its
   `recipes/{id}/` directory exists, and `registry.json` matches what the recipe files build to.
   Plus an informational re-verification freshness report.
2. **`pinned-deps`** — every recipe's Glean SDK dependency is pinned to an exact version.
3. **`recipe-checks`** — each recipe typechecks (`tsc --noEmit`) and lints (`ruff`, `pyright`).
4. **`format-check`** — Prettier formatting.
5. **`plugin-build`** — the plugin builds and validates for every target (Claude Code, Cursor,
   Codex), its generated skills and the README recipe table are checked against `registry.json` for
   drift, the committed output under `build/` is checked against a fresh render, and each recipe's
   copy of the shared stylesheet is checked against `styles/`.
6. **`harness-tests`** — `npm test`, covering the verify harness's OAuth state validation and PKCE
   derivation.
7. **`snippets-check`** — recipe prose and the code it embeds stay in sync.

## Releasing the plugin

```bash
npm run release
```

That's [release-it](https://github.com/release-it/release-it), configured in `.release-it.json`. It
picks the next version from the conventional-commit subjects since the last `v*` tag, writes
`CHANGELOG.md`, commits as `chore: release v{version}`, tags, and pushes.

The version it bumps is **`plugin/package.json`**, not the root `package.json` — the root package is
private and stays at `0.0.0`, because what gets released here is the plugin, not an npm package
(hence `npm: false`; nothing is published to a registry). `@release-it/bumper` reads the current
version from that file via its `in` option and writes the bumped one back, along with
`plugin/package-lock.json` so `npm ci` in `plugin/` doesn't see a version mismatch.

Everything else carrying a version is generated from there and needs no entry in the bumper config:
`plugin/pluginpack.config.ts` reads `version` out of `plugin/package.json`, so the `after:bump` hook
running `npm run build:plugin` is what propagates it into the three committed marketplace manifests
(`.claude-plugin/`, `.cursor-plugin/`, `.agents/plugins/`) and each emitted
`build/*/cookbook/*/plugin.json`. release-it stages tracked modifications before committing, so those
land in the release commit. Skip the rebuild and CI's `pluginpack diff` guard fails on the next PR
with manifests a version behind.

Don't reintroduce a literal version in `pluginpack.config.ts`: it would take precedence over the
bumped one and every release would rebuild the manifests back to the hardcoded value.

For release-it to create the GitHub Release itself, export a `GITHUB_TOKEN` with `repo` scope.
Without one it still commits, tags and pushes, then prints a pre-filled "new release" URL to finish
by hand.
