---
name: review-cookbook-recipe
description: >-
  Reviews Glean cookbook recipes against the reader-pass bar: printed first
  run, second-person copy, one generated source, own-instance demoQueries.
  Use when reviewing a cookbook recipe, walking developers.glean.com/cookbook,
  checking recipe.json setup copy, plugin /cookbook:{id} skills, first-run
  npm start, Lovable or Replit prompts, or UX of recipes under recipes/<id>.
license: MIT
---

# Review a cookbook recipe

Reader pass, not a feature pass. Follow the published page as a stranger with a Glean instance.

Gold copy: [cookbook#48](https://github.com/gleanwork/glean-cookbook/pull/48) (Customer 360). Do not clone its seven-step list onto MCP, Lovable, Replit, or `integrate` recipes.

Do not invent a new bar. The criteria live in [references/checklist.md](references/checklist.md). The traps that change a score live in [references/gotchas.md](references/gotchas.md).

## Pass

Every mode needs all four:

- You walked the published page cold, in order.
- The first printed command worked with no token and no special env.
- The generated skill says the same steps as the page.
- No Block finding is open.

A green test suite proves none of them. Should-fix may ship with a named owner. Park is recorded and left.

## Mode

| Mode        | When                                   | Score                                                         |
| ----------- | -------------------------------------- | ------------------------------------------------------------- |
| **Routine** | New recipe, rewrite, copy pass         | Block / Should-fix / Park                                     |
| **Launch**  | Showpiece, Go-blocking, demo rehearsal | Per-cell PASS / FAIL / BLOCKED + cause, plus routine findings |

Routine skips the own-instance live UI walk (step 5) unless the page asserts live behavior. Launch always runs step 5 on your own instance. A missing prerequisite is BLOCKED, not a quiet pass.

Cause tags (launch only): `docs`, `scaffold/plugin`, `content/data`, `platform/API`, `credentials/environment`, `browser UX`.

## Three moves

1. **Printed first run.** After copy and install, the printed command works with no token and no extra env.
2. **Copy talks to the reader.** Second person. One human action per step. Expected results name what appears on screen.
3. **One source.** Edit `recipe.json` and prompt files. Run `mise exec -- pnpm build`. Never hand-edit `registry.json`, plugin skills, or the site MDX.

## Walk

Copy this list and tick it:

```
- [ ] 1. Surfaces
- [ ] 2. Printed first run
- [ ] 3. Copy
- [ ] 4. One source
- [ ] 5. Live claims (if asserted, or launch mode)
- [ ] 6. Dual path and auth (if two codeAssets or two planners)
- [ ] 7. Third-party extras (if buildMethod is third-party-build)
- [ ] 8. Park the rest
```

### 1. Surfaces

Walk `developers.glean.com/cookbook/<id>` cold, in order, from the published ref. Not the README. Not a local checkout. Not a remembered `.env`.

Then walk `plugin/shared/cookbook/skills/<id>/SKILL.md` (`/cookbook:<id>`). It must say the same steps.

Freeze the first failure before diagnosing. Local source is diagnosis only.

A step `description` in `recipe.json` is the only prose field a step has. It renders as raw text on the site and as markdown in the skill. Write for both.

### 2. Printed first run

Read `buildMethod` in `recipe.json`.

**All recipes.** No "ready" while required blanks are empty. `--help` is not a first run. A GitHub SSH key is special env. Run the printed scaffold command on a host without one (see the scaffold gotcha).

**`scaffold` (runnable).** If the app needs Glean, the printed default is the fixture or recorded path, as a numbered step. Live is a later "adapt to your corpus" section. Do not ship fake live mode. The UI states which mode it is in. The UI surfaces server errors (no 500 as an empty state). Sample buttons work in the mode that offers them. Verify spawns the documented command, not a hidden `tsx` with injected env. Verify loads `.env`. A stop-the-server note sits before verify.

**`integrate`.** Blind rebuild from the generated `SKILL.md` alone. Do not inspect-and-patch `recipes/<id>/`. See `CONTRIBUTING.md`.

**`third-party-build`.** Step 7.

### 3. Copy

- Second person, present tense, one narrator. Never "the user supplied" / "answers already supplied" / "Enter the user's work email."
- One human action per step. Sign-in fills URL + token only. Leftovers (`GLEAN_ACCOUNT_NAME`, agent id, prefixes, `WATCHED_SERVICES`) are a later step. `login --require` lists blanks instead of printing ready. `--require` must catch missing keys, not only empty assignments.
- Step titles name a human action: "Copy the project onto your machine", "Sign in to Glean". Banned: "Scaffold the project", "Set credentials", "Run it."
- OAuth vs copy-`.env.example` as two exclusive sentences. Comment each `.env.example` key: what login fills vs what the reader fills.
- Tenant-sounding names explained in place (`GLEAN_ACCOUNT_NAME` is the customer's company, not the Glean tenant). Do not rename it.
- Expected results name on-screen outcomes (button, card, cited answer). Not theses, not internals.
- No em dashes, glyphs (`·`, `→`), markdown, or bare emails in `description` fields.
- Drop prereqs the scaffold already sends.
- UI chrome leaks no file names, env vars, Path A/B badges, endpoints, or raw SDK JSON. Errors are `error` + `hint` on every path.
- Do not change `demoQueries` count or order. Reword free.

### 4. One source

Edit `recipes/<id>/recipe.json` and prompt files. Run `mise exec -- pnpm build`, not `build:registry` alone, so the plugin skills render too.

A recipe PR commits `recipes/<id>/recipe.json` and the regenerated `registry.json`. It does not commit `plugin/shared`, `build/`, `.pluginpack`, or the README recipe table. After CI passes on `main`, `.github/workflows/sync-plugin.yml` runs `pnpm build` and commits those four. `CONTRIBUTING.md` says the same. Flag a recipe PR that commits any of them.

Never hand-edit: `registry.json`, plugin skills, README recipe table, `styles/tokens.css`, and on the site `docs/cookbook/<id>.mdx`, `data/cookbook-registry.json`, `src/data/recipes.json`, preview assets.

Site preview of unpushed work: `GLEAN_COOKBOOK_REF=<branch> pnpm registry:sync && pnpm recipes:compile`. `registry:sync` pulls GitHub `main` by default.

If `aiPrompt` or `llmContext` changed, set `lastVerified` to unset.

### 5. Live claims

Apply when the page asserts live behavior, or in launch mode.

- Own instance. No seeded corpus. No Acme / Alex Kim / Globex / "November" as live facts.
- Live copy claims only what holds on any corpus. Fixture-corpus evidence (named incidents, SOC 2 rows) stays on the fixture path.
- Citations present and grounded where promised. Off-corpus refuses or escalates. Nothing invented. Blank KPIs until cited.
- If the recipe exists to teach X, X is reachable by clicking. A green `verify:fixture` HTTP assert is not a UI pass.
- Fully exercise the app or stop. Do not score around a browser you cannot drive.
- Socket Firewall / sandbox TLS in the agent wrapper is not a recipe defect. A missing platform capability is `platform/API`, not a recipe FAIL.
- Secrets go into the ignored `.env` only. Never through the conversation. Ask about shape, never value.

Workarounds cannot cover: secret exposure, permission leak, unauthorized mutation, missing citations, false safety claims, act-as, or the agent driving a cookie-SSO URL.

### 6. Dual path and auth

Each `codeAssets` path is its own walkthrough. Path A passing carries nothing to Path B. Path labels must match the UI. If the page offers one scaffold with an optional planner, the copy says that.

Auth rail shows the selected path's scopes, not the union. Cookie Web SDK declares `scopes: []` and that empty list wins. `requiredScopes` match actual calls.

Cookie SSO: hand the reader a clickable URL. Do not open or automate it. No `chatId` with `initialMessage`.

Per-instance files are not recipe files (`steps.example.json`, not `steps.json`).

### 7. Third-party (`buildMethod: third-party-build`)

- `recipe.steps` is not empty. First documented action is correct with no local `npm start`.
- Copy button copies `pastePromptFile` (builder prompt), not `recipe.aiPrompt`.
- Docs readers never clone this repo. Never "open `recipes/.../file`". Never a plugin-only helper as a numbered docs step.
- Plugin users fill the prompt and stop. The topic the plugin asks for appears in the generated prompt.
- Token path is Client API tokens (`?tab=client`) on every surface. Instance value is the slug (`acme`), not `app.glean.com`.
- Secrets in the host secret store. Shared-token / keep-private warning stays.
- Do not credit an unrun host build. `lastVerified` stays unset. `pnpm verify:recipe` prints the manual checklist and must not fake a pass. Untested does not belong in `limitations`.
- `recipe.json`, prompt file, and README name the same verify pair.

### 8. Park

Record and move on unless it blocks the first run: unlabeled inputs, KPI vs pills, spacing, missing preview on a prompt recipe, architecture-diagram rewrite, deliberate product cuts, API migrations.

## Severity

Use only **Block**, **Should-fix**, **Park**.

| Gate           | Meaning                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Block**      | Printed path cannot be followed, a page claim is unreachable, or a safety property is false. Tag **Block/safety** for the workaround-forbidden list above. |
| **Should-fix** | Real defect. Reader can still succeed.                                                                                                                     |
| **Park**       | Polish. Does not block the first run.                                                                                                                      |

Old labels (`P0` to `P3`, `Act on`/`Consider`/`Leave alone`, `High`/`Medium`/`Low`): re-triage into this scale. `Act on` is not a gate.

## Report

```markdown
## Verdict

Mode: routine | launch
Result: pass | fail
Open Blocks: <n>
(Launch only: cell table with PASS/FAIL/BLOCKED + cause)

## Findings

| Gate | Finding | Surface | Evidence |

## Parked

| Item | Why parked |
```

Surfaces: `recipe.json` | published page | `SKILL.md` | README | running app.

Do not declare PASS from a subagent. The parent scores live.

## Machinery (do not restate)

- `CONTRIBUTING.md` owns the verify gate, `buildMethod`, pinned SDKs, `lastVerified`, and which generated files a PR commits.
- `plugin/scripts/generate-commands.mjs` (`isPublicRecipe`) and `schemas/recipe.schema.json` own `hidden` and `visibility: preview`.
- Developer-site `AGENTS.md` owns the generated site files.
- `plugin/shared/cookbook/skills/cookbook-conventions/SKILL.md` owns the auth handoff and no secrets in chat.
