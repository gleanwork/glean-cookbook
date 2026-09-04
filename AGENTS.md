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
