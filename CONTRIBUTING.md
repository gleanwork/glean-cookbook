# Contributing

## Toolchain

This repo pins Node, pnpm, Python, and uv in `mise.toml`. The root package is a pnpm project
(`pnpm-lock.yaml`). Recipe scaffolds and `plugin/` stay on npm, because those directories are
copied or installed on their own. Run repository commands through mise so a global package-manager
version cannot rewrite a lockfile or use different dependency semantics:

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm test
```

Recipe, checker, generator, and runtime changes go through a PR against `main` with an
approving review. Instruction-only changes may go directly to `main` when a maintainer
explicitly authorizes that action and repository policy permits it. Never bypass required
checks or branch rules.

Before pushing, run:

```bash
mise exec -- pnpm build:registry
mise exec -- pnpm format
mise exec -- pnpm validate:registry
```

Recipe PRs update `registry.json`, but do not include generated plugin output. CI renders and
validates the plugin in a temporary workspace. After CI succeeds on `main`, the `Sync plugin
outputs` workflow commits the generated plugin output to `main` automatically. Hand-authored
`plugin/partials/*.md`, the conventions skill, and unmarked prose in the browse skill are
shared instruction sources, not generated recipe skills. Review changes to those sources
separately from recipe implementation changes; never edit their generated copies.

`pnpm test` also discovers every npm package under `recipes/` and `examples/`. It runs `check` when
a package declares it, otherwise `test`, after installing from that package's own lockfile. Keep
those packages standalone rather than adding them to a root workspace: users scaffold one recipe
directory and should exercise the same npm dependency graph that CI does.

## Setup

```bash
mise exec -- pnpm install --frozen-lockfile
mise exec -- npm --prefix plugin ci   # once — the plugin is its own npm project with its own lockfile
```

## Adding a recipe

Adding a recipe means adding both:

1. `recipes/{id}/` with the runnable code (or a short README explaining why there isn't any)
2. `recipes/{id}/recipe.json`, then `mise exec -- pnpm build:registry`

There is no hand-written docs page. [glean-developer-site](https://github.com/gleanwork/glean-developer-site)
generates `docs/cookbook/{id}.mdx` from `registry.json` when it runs `pnpm registry:sync` and
`pnpm recipes:compile` (see [The registry](#the-registry)). Wait for that generated page, or run
those two commands in a site checkout to preview it. Do not create or edit the MDX by hand.

Previewing is the only reason to run them locally: the result is scratch, not a change to
submit. **Do not open a companion PR on the site to publish recipe content.** The existing
scheduled sync generates its own PR with auto-merge enabled. Confirm required approvals,
checks, and deployment have completed; neither a merge here nor the schedule proves that
the page is deployed. See [Release and verification lifecycle](#release-and-verification-lifecycle).

Do not commit generated plugin skills, manifests, or `build/` output in a recipe PR. The plugin's
skills are generated from `registry.json` in CI and are committed automatically after the merge
lands on `main`.

A supplied spec or ticket defines the agreed developer outcome. Review its proposed registry
entry and implementation details against current supported APIs before copying them. Correct
bad commands, scopes, and assumptions at their source, with a documented rationale. A change
to the promised capability, safety guarantees, or scope needs explicit agreement from the
scope owner; do not weaken expectations just to pass verification. Keep `demoQueries` and
`expectedBehavior` accurate and meaningful. Examples must work with appropriate content from
a reader's own instance, and `aiPrompt` must produce what it promises.

## Recipe directory conventions

Each `recipes/{id}/` directory is a **self-contained, runnable example** — it should work if someone
copies just that directory into a fresh project. Include all required setup documentation
and templates in the copied directory; do not require unstated repo-root files.

- **Language subdirectories** where a recipe ships more than one client (e.g.
  `recipes/permissions-aware-retrieval/python/`, `.../typescript/`).
- **A `README.md` per recipe** — the quickstart for someone browsing GitHub directly. Keep its
  commands and explanations consistent with the page source in `recipe.json`. Recipes with no standalone runnable code (e.g.
  `build-engineering-portal/`, `embed-search-chat/`) still get a directory with a short README
  explaining why.
- **No hardcoded credentials, ever.** Use the recipe's declared authentication path: a supported
  auth library and its secure store, documented environment variables, a host secret store, or
  browser SSO. Do not require API tokens for a cookie-SSO path. Include `.env.example` when that
  path uses `.env`, with required variable names and comments matching the actual code. Never
  request secrets in conversation, log them, or embed their values in commands.
- **Pinned dependencies.** Glean SDKs (`glean-api-client`, `@gleanwork/api-client`,
  `@gleanwork/web-sdk`, `glean-indexing-sdk`) are pinned to an exact released version — no `^`, `~`,
  or `latest`. CI (`pinned-deps`) fails a recipe that isn't, for both npm and Python (including PEP
  723 inline dependencies).
- **Explicit npm install-script policy.** Every dependency marked with `hasInstallScript` in a
  recipe's `package-lock.json` must be approved or denied in that recipe's `package.json`
  `allowScripts` map. Review pending packages with
  `npm approve-scripts --allow-scripts-pending`; approve only reviewed packages with
  `npm approve-scripts <package>` so npm pins the installed version, or record a denial with
  `npm deny-scripts <package>`. Never use `--all` without reviewing each script. Re-run a clean
  `npm ci` after changing the policy, then run `pnpm install-scripts:check` from the repository root.
- **Locked transitively.** Python recipes using inline dependencies commit a `<script>.py.lock` from
  `uv lock --script`. An exact direct pin still leaves dependencies-of-dependencies floating; the
  lock pins the full tree with hashes, so a recipe verified months ago still installs what it was
  verified with. Re-run `mise exec -- uv lock --script <script>` after editing inline dependencies.

## The registry

Recipe metadata is authored **one file per recipe**, at `recipes/{id}/recipe.json` — title,
description, prerequisites, `aiPrompt`, everything a recipe's dev site page or the `glean-cookbook`
plugin needs. The shape is defined by the canonical `schemas/recipe.schema.json` in this
repo. The developer site's `src/types/recipe.ts` is a structural
consumer adapter; capability and surface values are synced as data instead of duplicated there.

Capability and surface values, display labels, and filter order live in
`config/recipe-taxonomy.json`. Update that file and the matching schema enum together when
adding one. `validate:registry` rejects drift between them.

`registry.json` at the repo root is **generated** from those files and committed — the dev site syncs
it as a single fetch, and the plugin's skills are generated from it. Don't hand-edit it; CI fails if
it's out of sync with the `recipe.json` files.

The dev site pulls the built registry with `mise exec -- pnpm registry:sync` then
`mise exec -- pnpm recipes:compile`. Its `sync-cookbook-registry` workflow runs both every 15
minutes and opens a PR with auto-merge enabled. This is the publication path, not evidence that a
particular sync or deployment has completed.
The sync generates one `docs/cookbook/{id}.mdx` per recipe, matched by filename === `id`.
Those pages are generated output, not authored prose.

The sync copies `config/recipe-taxonomy.json` before compiling, so a new capability or
surface still ships entirely from this repo. Enums with presentation behavior — such as a
new category or status — may require consumer code, but generated recipe content still does
not belong in that consumer PR.

Use the visibility fields deliberately:

- Set `"hidden": true` when a recipe must not be generated for customers at all. Hidden recipes remain
  in the source and full registry for internal development, but are omitted from the docs site,
  cookbook plugin, and GitHub README.
- Set `"visibility": "preview"` when a recipe should be deployed for review without public discovery.
  Preview recipes are omitted from the cookbook plugin and GitHub README. The developer site generates
  an unlisted, no-index page and reveals its card and detail content only when the URL includes an exact
  `ff_recipe=<recipe-id>` query parameter.

## Verifying a recipe

A recipe is a recommended reference implementation, not a demo patched until it passes.
Its authored code and instructions should be the approach we would tell a developer to use
from scratch, within the stated scope. Fix incorrect assumptions and unnecessary mechanisms
at their source; generated output must not compensate for them.

Every recipe must pass three quality gates: it works as documented, reads as developer
instructions rather than an agent prompt, and teaches idiomatic composition with supported
packages rather than rebuilding supporting infrastructure. Use the existing
[review skill](.agents/skills/review-cookbook-recipe/SKILL.md) and its
[ordered release checklist and evidence record](.agents/skills/review-cookbook-recipe/references/checklist.md)
as the single review procedure. It covers fresh-directory execution, authorized live outcomes,
failure and cleanup behavior, writing, composition, generated surfaces, regression checks,
and deployment confirmation. The executable gates below support that procedure; they do not
replace the walkthrough.

Record each gate as PASS, FAIL, BLOCKED, or N/A with a reason, tied to the tested revision.
Missing credentials, hosts, or a required rendered page are BLOCKED, never a pass. A reproduced
failure of promised behavior is FAIL even when the cause is in the platform. Keep the cause
separate from the verdict. This evidence applies to the tested revision and environment; it
is not a guarantee against future platform changes.
A reader-pass walk of `/cookbook:{id}` needs `mise exec -- pnpm build` locally so the generated
skill is current. Do not commit that plugin output. Recipe PRs still push with
`mise exec -- pnpm build:registry` as above.

### Release and verification lifecycle

Use these states consistently. A later state requires its own evidence:

1. **Ready for review:** the authored design, commands, and copy meet the quality bar, and
   applicable local tests and repository checks pass. Known safety defects are resolved.
   This is not an end-to-end or live verification claim.
2. **Merged:** an authorized, reviewed source change is on Cookbook `main`. The site and
   distributed plugin may still be on an older revision.
3. **Deployed for review:** the existing sync and deployment expose the intended revision.
   Prefer preview visibility for new recipes that still need a reader pass. A preview is
   unlisted, not hidden. Public promotion is an explicit publication decision.
4. **End-to-end verified:** read the actual deployed page (preview or public), then execute
   each printed command in order from a fresh directory as a developer would. Fill only
   documented inputs. Do not rewrite commands, inject unpublished fixes, or substitute a
   local test suite. Verify each promised outcome, advertised variant, and authentication
   path with authorized live checks. Record code, page, and distributed-artifact revisions.
5. **Published and verified:** the public page and intended discovery/navigation paths work,
   and the distributed plugin agrees with the verified source where applicable. A preview
   can be end-to-end verified without being publicly published.

A failure restarts the loop: record the first failure, correct its owning source, rerun local
checks, submit the fix, confirm the next sync/deployment, and repeat the affected cold run.
Do not call an existing public recipe verified merely because it was already public. Keep
its ticket open until publication, verified merge into another recipe, or explicit verified
retirement meets the agreed acceptance criteria.

Hidden integrations can be assessed internally using a scratch render from the existing
recipe-skill renderer, without changing visibility or shipping that render. This checks the
candidate instructions only. A hidden recipe cannot satisfy the deployed-page gate; expose
an authorized preview before claiming end-to-end verification. For preview integrations,
use an internal skill render from the same source revision for the blind-build check; do
not expect a public plugin skill to exist yet.

Fixture tests and recorded examples are useful local evidence. A runnable demo mode is
optional and appropriate only when it helps teach the capability. Keep it explicitly labeled
and opt-in; do not require an artificial demo mode for every live API quickstart. For existing
presentation demos, honor `GLEAN_COOKBOOK_DEMO` and the recipe's declared demo support. An
optional demo never replaces testing the normal configured path or required offline tests.

What "verify" means depends on the recipe's `buildMethod`:

- **`scaffold`** recipes render from `steps`, not a hand-written `aiPrompt` — building one means
  running the recipe's own literal, checked commands (a `tiged` copy or a real CLI invocation), not
  regenerating code from prose. There's no drift for an LLM to introduce in that part. What still
  needs a real run is the recipe's own `## Verify` step and, where one exists, its `verify` script
  (e.g. `recipes/company-answers/chat-api/scripts/verify.mjs`).
- **`integrate`** recipes still drive off a hand-written `aiPrompt` — this is where genuine
  regeneration-from-prose happens, and where drift (a stale response shape, a deprecated field) can
  hide undetected between runs.
- **`third-party-build`** recipes (Lovable, Replit) put the builder paste in a four-backtick `text`
  fence and name that file as `pastePromptFile`. The docs copy button inlines that fence as
  `pastePrompt` so a reader can copy without cloning this repo. `aiPrompt` is only for a coding
  assistant filling placeholders, not for pasting into the builder. Put the actual hosted
  verification actions and expected outcomes in the authored steps. Structured skills render
  those steps; they do not automatically include the unstructured verification partials.
  Inspect the generated instructions rather than assuming a shared partial reaches every recipe.

For integrate recipes especially, verify with a **genuinely fresh build, not inspect-and-patch**:
spawn an isolated agent (a fresh subagent, or a scratch git worktree) whose _only_ input is the
generated skill at `plugin/shared/cookbook/skills/{id}/SKILL.md` — the same content a real
`/cookbook:{id}` invocation gets. Do not hand it the existing `recipes/{id}/` code to read and patch;
that only ever confirms "the code I'm already looking at still basically works," and misses the case
where the _skill_ is what's wrong, not the reference code. A blind rebuild catches drift in either
direction. Then run the recipe's demo queries against a real, live Glean instance and confirm each
one's `expectedBehavior` actually holds — not that the prose still reads correctly.

### The verify gate

`mise exec -- pnpm verify:recipe <recipe-id>` is the executable form of a recipe's `## Verify`
section. It reads
the queries from `recipes/<id>/recipe.json`'s `demoQueries` — never restates them — so adding a query
to the registry adds it to verification. `expectedBehavior` stays prose for humans; the executable
assertion lives in `scripts/verify/<id>.mjs`, the only per-recipe part.

It requires real credentials and **fails rather than skipping** when they're absent: a verify run
that quietly skips reports success for an unverified recipe, which is worse than no gate at all. Each
module declares the environment it needs, so a run stops with a list of what to set.

For `third-party-build` recipes, the app runs in the named host. The driver prints the
acceptance scenarios; it does not verify the hosted app. Execute those scenarios in that
host with the available authorized tools, handing off only actions that require the user.
If access is unavailable, record BLOCKED rather than treating the printed scenarios as a pass.
For `integrate` recipes, a platform-only verifier does not prove that the generated integration
works. Build from the instructions and test the integration in its declared environment.

Once the required rendered-page and live checks succeed, set `lastVerified` to that date
in the authored `recipe.json` and rebuild the registry. A fixture or test-suite pass alone
does not qualify.
`mise exec -- pnpm check:freshness` (also runs in CI, informational only) reports which recipes
have never been
verified this way, or haven't been re-checked in 90+ days — treat either as the trigger to schedule a
fresh-build pass.

The freshness report does not infer whether an edit invalidated previous evidence. Remove
`lastVerified` when changes to prompts, commands, authentication, dependencies, or runtime
behavior invalidate the verified path. Restore it only after rerunning affected checks.
Omit the property to represent an unverified recipe; the schema does not accept the literal
string `unset`. Scheduling a run is not evidence that it passed.

## Styling a recipe UI

For standalone cookbook UI scaffolds, compose the supplied shared stylesheet rather than
rebuilding its styling primitives:

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

| File                  | Owner                                                         |
| --------------------- | ------------------------------------------------------------- |
| `styles/cookbook.css` | **Authored.** Edit this.                                      |
| `styles/tokens.css`   | **Generated** by `mise exec -- pnpm sync:tokens`. Never edit. |

`mise exec -- pnpm build:artifacts` materializes them into every UI scaffold discovered by
`scripts/artifacts.config.mjs` and copies the logomark alongside. The same declarative artifact plan
distributes the shared authentication and local-server runtimes. Those copies are committed—a recipe
is scaffolded one directory at a time with `tiged`, so root files would never reach it. CI evaluates
the plan in read-only mode and fails if any output is stale.

Integrations into an existing app should follow that app's design system; do not impose a
second global stylesheet. Third-party builders follow the recipe's host-specific styling
instructions. Style the surrounding page, not the internals of embedded Glean components.

Primitives are presentational and carry no copy. What an empty state _says_ is a per-recipe decision;
how it _looks_ is not.

### Keeping tokens matched to the developer site

The design tokens are the dev site's, not ours: `styles/tokens.css` is generated from the `--gdt-*`
block in [glean-developer-site](https://github.com/gleanwork/glean-developer-site)'s
`src/css/custom.css`, plus the radius/shadow scales from its theme package. That's what makes a recipe
and the Cookbook page describing it look like one product.

```bash
mise exec -- pnpm sync:tokens                       # expects ../glean-developer-site
mise exec -- pnpm sync:tokens -- --site <path>      # or GLEAN_DEVELOPER_SITE=<path>
mise exec -- pnpm sync:tokens -- --check            # report drift without writing
```

This is a deliberate manual sync, not a CI check — the dev site isn't available in CI. Re-run it when
the brand changes. It fails loudly rather than guessing if the dev site introduces a token it can't
resolve, so a failure means read the message, not work around it.

## CI

Every PR runs:

1. **`validate-registry`** — every `recipe.json` validates against `schemas/recipe.schema.json`, its
   `recipes/{id}/` directory exists, and `registry.json` matches what the recipe files build to.
   Plus an informational re-verification freshness report.
2. **`pinned-deps`** — every recipe's Glean SDK dependency is pinned to an exact version, and each
   npm lifecycle script is covered by an explicit pinned approval or denial.
3. **`recipe-checks`** — each recipe typechecks (`tsc --noEmit`) and lints (`ruff`, `pyright`).
4. **`format-check`** — Prettier formatting.
5. **`plugin-build`** — the plugin generates and validates a fresh render for every target (Claude
   Code, Cursor, Codex). Generated plugin output is temporary on PRs and is committed automatically
   by the main-branch sync workflow after CI succeeds.
6. **`harness-tests`** — `mise exec -- pnpm test`, covering the verify harness's OAuth state validation and PKCE
   derivation.
7. **`snippets-check`** — recipe prose and the code it embeds stay in sync.

## Releasing the plugin

```bash
mise exec -- pnpm release
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
running `mise exec -- pnpm build:plugin` is what propagates it into the three committed marketplace manifests
(`.claude-plugin/`, `.cursor-plugin/`, `.agents/plugins/`) and each emitted
`build/*/cookbook/*/plugin.json`. release-it stages tracked modifications before committing, so those
land in the release commit. Skip the rebuild and CI's `pluginpack diff` guard fails on the next PR
with manifests a version behind.

Don't reintroduce a literal version in `pluginpack.config.ts`: it would take precedence over the
bumped one and every release would rebuild the manifests back to the hardcoded value.

For release-it to create the GitHub Release itself, export a `GITHUB_TOKEN` with `repo` scope.
Without one it still commits, tags and pushes, then prints a pre-filled "new release" URL to finish
by hand.
