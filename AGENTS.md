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

### The exception: teaching the site a value it does not know

Recipe fields are enums on both sides. The developer site validates each synced entry
against its consumer adapter, `src/types/recipe.ts`, and **exits 1 on a value that adapter
has never heard of**. A recipe introducing a new `capabilities`, `surfaces`, `category`, or
`status` member therefore does not render badly — it fails the sync job before any pull
request is opened, and keeps failing every 15 minutes, for every other recipe too, until
someone adds the value there.

So when, and only when, you add an enum member:

1. Open a developer-site pull request carrying the adapter change **alone**:
   `src/types/recipe.ts` and its label map, `scripts/compile-recipes.ts` if the value needs
   a filter facet, the tests, and the regenerated `schemas/recipe.schema.json`. No registry
   snapshot, no `.mdx`, no `src/data/recipes.json` — the sync writes those.
2. Merge it first. An enum member no recipe uses yet is inert, so it is safe to land ahead
   of the recipe that needs it.
3. Then merge the recipe here, and let the scheduled sync publish it.

Keep `schemas/recipe.schema.json` here in step with that adapter — it is the contract
`validate:registry` checks every `recipe.json` against.
