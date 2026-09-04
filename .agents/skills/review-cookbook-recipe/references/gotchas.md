# Cookbook review gotchas

Load [SKILL.md](../SKILL.md) first. These traps change the score. Do not "fix" them back to an older bar.

## Plugin path vs page as product

Both are required when `isPublicRecipe` is true. Hidden recipes have no docs page and no plugin skill. Preview has the `?ff_recipe=<id>` page only. Aug 19 treated `/cookbook:{id}` as the intended reader path. Aug 20 treated the human page as the product because plugin-voice copy made the site unreadable. Walk the page first, then the skill. One `recipe.json` string feeds both, so copy is second-person enough for the page and precise enough for the skill. Do not add a second schema field. Do not hand-edit either generated surface.

## Fixtures

If the app cannot run without Glean, a fixture or recorded first run is required and printed. Live is "adapt to your corpus," not the quickstart. Do not flip `GLEAN_USE_FIXTURE` to make a live claim green. Do not ship fake live mode.

`GLEAN_COOKBOOK_DEMO` only changes the banner. Combined with `npm start` it labels a live run "Sample environment."

## Seeded corpus is retired

Own instance won. Acme, Alex Kim, Globex, or a hardcoded "November" on a live path is a defect. Labeled sample data under `fixtures/` with a mode banner is fine.

## A green harness is not a UI pass

Three real misses:

- `verify:fixture` asserted a 403 over raw HTTP while the dashboard always made the reader the approver.
- `verify.mjs` booted `tsx` with injected env, so CI never saw the broken `npm start`.
- Client Chat `npm run verify` passed while the UI answered the wrong question.

If the recipe teaches X, X is a click.

## `registry:sync` does not see the working tree

It pulls GitHub `main`. Unpushed preview needs `GLEAN_COOKBOOK_REF=<branch>`. `pnpm build:registry` alone leaves `/cookbook:{id}` stale.

## Generated MDX

`docs/cookbook/<id>.mdx` on the developer site is generated. `pnpm registry:sync` writes it from this repo's `registry.json` and `pnpm recipes:compile` compiles it. Do not edit it, and do not ask an author for a hand-written page. `CONTRIBUTING.md` (Adding a recipe) and the developer-site `AGENTS.md` say the same.

## `hidden` drops the plugin skill and the README row

`plugin/scripts/generate-commands.mjs` decides what the plugin and the README list:

```js
function isPublicRecipe(recipe) {
  return !recipe.hidden && recipe.visibility !== 'preview';
}
```

`schemas/recipe.schema.json` describes `hidden` as "When true, the recipe is not generated for the developer docs site, cookbook plugin, or GitHub README." A hidden or preview recipe keeps its `recipes/<id>/` directory and its `registry.json` entry, and the developer site's registry snapshot keeps the row. It gets no `/cookbook:<id>` skill and no README row. Preview also gets an unlisted, no-index site page behind `?ff_recipe=<id>`. Full exclusion is omitting `recipe.json`.

The developer-site `AGENTS.md` says a hidden recipe stays "in the plugin". That sentence describes the site's snapshot, not this repo's generator. Score against `isPublicRecipe`. A missing skill or README row for a hidden recipe is not a build defect. A `hidden` flip is a publishing decision, not a review fix. [PR 82](https://github.com/gleanwork/glean-cookbook/pull/82) made that decision for `streaming-chat-with-citations` so the site preview rendered and the plugin listed it.

## Site flag

If local nav is missing, the flag key is `cookbook` (singular). `FF_COOKBOOKS` mapping to `cookbooks` is a false green. AGENTS.md now says Cookbook nav is public by default; confirm before treating a missing nav as a recipe defect.

## Dual path is not a copy fork

Four showpiece recipes produced seven cells. The inverse error: copy that says Path A / Path B when the page offers one scaffold. Score the UI, not the ticket skeleton.

## Cookie `scopes: []` must win

Treating an empty cookie scope list as "undeclared" reintroduces `CHAT` on a Web SDK path that never calls it.

## Title-ban CI is not in place

"Scaffold the project" / "Set credentials" is still a human/agent check. Do not expect a linter to catch it.

## Scaffold over HTTPS, stream through the SDK

[PR 81](https://github.com/gleanwork/glean-cookbook/pull/81), [PR 82](https://github.com/gleanwork/glean-cookbook/pull/82), and [PR 83](https://github.com/gleanwork/glean-cookbook/pull/83) landed `streaming-chat-with-citations` in three passes: SDK streaming, unhide, HTTPS scaffold. Two traps outlived a green test suite.

`npx tiged --mode=git` clones `git@github.com:gleanwork/glean-cookbook` over SSH. A reader with no GitHub SSH key sees `Permission denied (publickey)` on the first printed command. Your machine with an SSH key, or a CI host that rewrites `git@github.com:` to HTTPS, hides the failure. PR 83 dropped `--mode=git` for this recipe, so tiged's default tar mode fetches the same directory over HTTPS with no git and no credentials. Other recipes still print `--mode=git`; `grep -l -- --mode=git recipes/*/recipe.json` lists them. Walk the printed command with `HOME` set to an empty directory and `GIT_CONFIG_GLOBAL=/dev/null`. An SSH key is special env, so score the SSH failure under "works with no token and no special env".

The Client API recipe streams every turn through `@gleanwork/api-client` 0.20.2 `chat.createStream()` (PR 81). A hand-written SSE parser, `stream: true` on `create()`, or an `Accept` header override is the retired path, and the recipe's `aiPrompt` bans all three. `--server-url` and `GLEAN_SERVER_URL` take the backend HTTPS origin only, `https://<instance>-be.glean.com`. `src/client.ts` rejects a path, query, port, or embedded credentials with "Use a complete Glean backend HTTPS origin." Do not paste `app.glean.com`, and do not append a path such as `/qe`.

## Open product questions (do not improvise)

- Uncited "none to report": `recipe.json` allows an honest empty answer; some verify harnesses fail an empty `citations` array. File it. Do not pick a side in copy.
- Whether page and skill may ever diverge (skill word cap vs human explanation). Today they share one string.
- Whether every `scaffold` recipe needs a blind `SKILL.md` rebuild. CONTRIBUTING requires it for `integrate`. Run it for `integrate`. Optional for `scaffold` unless the review is launch mode.
