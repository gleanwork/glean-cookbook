# REVIEW.md

Rules for reviewing changes in this repository. People and review agents both follow this file. `AGENTS.md` and `CONTRIBUTING.md` hold the full conventions. This file covers what review checks.

## Always check

- **Recipes are recommended implementations.** The authored code, commands, defaults and explanations must be worth copying on their own. Running successfully is necessary but not enough. Ask whether a good Glean engineer, starting from scratch, would build it this way.
- **Fix the owning source.** A fix belongs in `recipes/{id}/recipe.json` or the recipe's code, not in a generated surface or a checker that hides the defect. A change that patches presentation to cover a wrong instruction is a blocker.
- **No invented fallbacks.** Recipes use supported SDKs, packages and runtime facilities. A compatibility layer for an unsupported path, or a workaround that makes a flawed example look complete, is a blocker. A documented, deliberate simplification is fine.
- **Promised outcomes hold.** A change does not weaken a recipe's promised outcome or safety guarantee to fit the implementation. Reducing scope needs explicit approval in the PR.
- **New TypeScript CLI recipes** model the reference recipes named in `CONTRIBUTING.md`, not the nearest existing recipe. Recipes on the legacy allowlist are not templates.
- **Generated files stay generated.** `registry.json` and the plugin outputs are built (`pnpm build:registry`), not edited by hand.
- **Metadata, code and README agree.** The steps in `recipe.json`, the runnable code and the README describe the same workflow.

## Flag only when

- A developer following the recipe would get a wrong result, an unsafe default, or code they should not copy. Name the step.
- An API, scope or SDK version the recipe uses is not supported today. Cite the current docs or package.
- A test or verify step would pass even if the recipe were broken.

## Skip

- Generated files listed above.
- Formatting that `pnpm format` already handles.
- Wording preferences that do not change meaning.

## Severity

- **Blocker:** a wrong or unsafe instruction, an invented fallback, a weakened promised outcome, or a hand edit to generated files.
- **Should fix:** a recipe modeled on a legacy pattern, metadata that disagrees with the code, or a missing limitation note.
- **Nit:** anything else. Group nits together and never block on them.
