# AGENTS Instructions

Recipes are authored here: metadata in `recipes/{id}/recipe.json`, the runnable code beside
it in `recipes/{id}/`, and a generated `registry.json` built from both.

Read `CONTRIBUTING.md` before changing anything — the toolchain, recipe directory
conventions, the registry, the verify gate, styling, and CI are all specified there.
`CONTEXT.md` defines the vocabulary (recipe, variant, execution contract).

Run repository commands through mise so a global package-manager version cannot rewrite a
lockfile:

```bash
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm build:registry
mise exec -- pnpm validate:registry
mise exec -- pnpm format
mise exec -- pnpm test
```

## Recipes are recommended implementations, not patched demos

A cookbook recipe shows how a good Glean engineer would recommend building the advertised
capability. Running successfully is necessary, but not sufficient. The authored code,
commands, defaults, and explanations must be correct and worth copying on their own.
Generated surfaces present that source; they must not compensate for defects in it.

When a failure appears, step back before patching:

1. State the developer outcome and the supported, idiomatic way to achieve it.
2. Identify the incorrect assumption or design choice that caused the failure. Do not
   assume the current implementation deserves to be preserved.
3. Correct the owning design or source. Prefer removing unnecessary machinery over adding
   another workaround. The smallest textual patch is not the cleanest fix if it preserves
   the wrong design.
4. Verify the corrected instructions end to end, then confirm the code still teaches the
   approach we would recommend starting from scratch.

Use supported SDKs, packages, and runtime facilities. Verify current API and scope support
before adding compatibility behavior. Do not invent fallback layers to preserve an
unsupported path. Keep examples focused, but make production-relevant safety and limitations
explicit. A deliberate, documented simplification is different from a workaround that makes
a flawed example look complete. Passing CI, matching another consumer, or reaching a release
date cannot substitute for this quality bar.

## Fix the authored recipe, not its presentation

The developer's documented workflow is the contract. Existing checkers, generators, and
workarounds are implementation details, not evidence that incorrect instructions must stay.

- Fix bad commands, copy, scopes, and defaults in `recipes/{id}/recipe.json` or the owning
  recipe code. Keep execution metadata and the README consistent with those instructions.
- Treat numbered commands as one sequential shell session unless the recipe explicitly
  tells the developer to start a new one. Directory and environment changes persist.
- Do not add renderer normalization, command rewriting, hidden directory resets, or
  compatibility wrappers to make broken authored instructions appear correct. Presentation
  formatting is fine; silently repairing command semantics is not.
- If a checker requires the wrong developer workflow, correct that assumption in the
  checker and add a focused regression test. Preserve its valid safety checks. Do not
  distort the recipe just to satisfy the checker or remove checks merely to get green CI.
- Change a shared renderer only when a minimal example shows it mishandles **valid authored
  input**, or when a shared feature is explicitly requested. An existing workaround in
  another consumer is not sufficient justification. Prefer the smallest change in the
  component that owns the defect; do not generalize one recipe fix into new infrastructure.
- Test the raw authored command sequence without a repair transform, then confirm the
  generated page and skill preserve it. A test of transformed output alone cannot prove
  that the source instructions are correct. Fixtures do not replace a live reader pass.

## Recipe work does not touch glean-developer-site

A recipe ships when it merges here. Do not open a companion pull request on
[glean-developer-site](https://github.com/gleanwork/glean-developer-site) to publish it,
and do not write recipe content into that repository by hand.

The developer site regenerates its entire copy of the cookbook on a 15-minute schedule
(`sync-cookbook-registry`), which runs `registry:sync` and `recipes:compile` there and opens
a pull request with auto-merge enabled:

| generated on the developer site      | built from                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `data/cookbook-registry.json`        | this repo's built `registry.json`                                                |
| `docs/cookbook/{id}.mdx`             | the recipe's `content` block — problem, guardrails, limitations, take it further |
| `src/data/recipes.json`              | compiled from that snapshot                                                      |
| `static/img/cookbook/previews/{id}/` | the recipe's declared `preview` asset                                            |
| `data/cookbook-plugin.json`          | the generated marketplace manifest                                               |

There is no prose to hand-write over there. A recipe's page is generated from its
`recipe.json`, and the sync deletes every page it did not just write. So a page added by
hand looks completely correct — it renders, and it passes CI — and then disappears the next
time the cron runs. The only lasting effect is a pull request somebody has to close.

### Capabilities and surfaces are cookbook-owned

Their values, display labels, and filter order live in `config/recipe-taxonomy.json`. To add
one, update that file and the matching enum in `schemas/recipe.schema.json` in the same
cookbook PR. `validate:registry` rejects drift between them. The developer site syncs the
taxonomy before compiling recipes, so this does not require a site change or a sequenced PR.

Other enums can carry presentation behavior rather than just labels. A new `category`,
`status`, execution type, or similar value may still require site or plugin code. That is a
feature change in the relevant consumer, not a companion registry sync: carry only the
consumer behavior there and continue to let the scheduled sync publish the recipe.
