# Cookbook review gotchas

Load [SKILL.md](../SKILL.md) first. These traps change the score. Do not "fix" them back to an older bar.

## Plugin path vs page as product

Both are required. Aug 19 treated `/cookbook:{id}` as the intended reader path. Aug 20 treated the human page as the product because plugin-voice copy made the site unreadable. Walk the page first, then the skill. One `recipe.json` string feeds both, so copy is second-person enough for the page and precise enough for the skill. Do not add a second schema field. Do not hand-edit either generated surface.

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

Developer-site `AGENTS.md` is the rule: `docs/cookbook/<id>.mdx` is generated. Do not edit it. `CONTRIBUTING.md` still talks as if it were a prose page; ignore that.

`visibility: preview` and `?ff_recipe=` are current AGENTS.md machinery. `"hidden": true` only hides the docs page. Plugin, GitHub README, and `/cookbook:{id}` stay listed. Full exclusion is omit `recipe.json`.

## Site flag

If local nav is missing, the flag key is `cookbook` (singular). `FF_COOKBOOKS` mapping to `cookbooks` is a false green. AGENTS.md now says Cookbook nav is public by default; confirm before treating a missing nav as a recipe defect.

## Dual path is not a copy fork

Four showpiece recipes produced seven cells. The inverse error: copy that says Path A / Path B when the page offers one scaffold. Score the UI, not the ticket skeleton.

## Cookie `scopes: []` must win

Treating an empty cookie scope list as "undeclared" reintroduces `CHAT` on a Web SDK path that never calls it.

## Title-ban CI is not in place

"Scaffold the project" / "Set credentials" is still a human/agent check. Do not expect a linter to catch it.

## Open product questions (do not improvise)

- Uncited "none to report": `recipe.json` allows an honest empty answer; some verify harnesses fail an empty `citations` array. File it. Do not pick a side in copy.
- Whether page and skill may ever diverge (skill word cap vs human explanation). Today they share one string.
- Whether every `scaffold` recipe needs a blind `SKILL.md` rebuild. CONTRIBUTING requires it for `integrate`. Run it for `integrate`. Optional for `scaffold` unless the review is launch mode.
