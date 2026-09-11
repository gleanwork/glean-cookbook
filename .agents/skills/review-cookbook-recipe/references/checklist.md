# Cookbook review checklist

Load [SKILL.md](../SKILL.md) first. This is the single recipe quality checklist, not an optional copy review. Use the ordered release checklist below for every recipe, then the detailed criteria for its applicable surfaces.

## Required quality gates

The standard is a recommended reference implementation, not a demo repaired until it passes. The source should teach the design a Glean engineer would choose from scratch, within the stated scope. At each failure, reconsider the underlying design before adding a mechanism. An unsupported path, unnecessary compatibility layer, or hidden repair fails this bar even if tests pass.

1. **Works as documented.** A developer can follow the exact rendered instructions from a fresh directory and obtain the promised outcome. Tests support, but never replace, this walkthrough.
2. **Reads like developer documentation.** Explain what you do, why, and what success looks like. Reader-facing prose must not sound like an agent prompt or verification harness. Keep agent-only instructions in agent fields.
3. **Teaches idiomatic composition.** Use supported SDKs, runtime features, and established packages. Keep custom code focused on the capability being taught. A short imperative workflow is appropriate; rebuilding authentication, configuration, transport, or other supporting infrastructure requires a documented package gap.

A review is evidence for a specific revision, environment, and date, not a guarantee against future API or dependency changes. Repeat affected checks after a change. Never transfer a pass from an older revision, another variant, a fixture, or a different host.

## Ordered release checklist

Before choosing a fix, apply the [source-first rule](../../../../AGENTS.md#fix-the-authored-recipe-not-its-presentation): identify the component that owns the defect. A checker conflict is not a reason to preserve bad authored instructions. A shared renderer change requires a minimal failing example with valid source, or an explicitly requested shared feature.

Run these steps in order. Record **PASS**, **FAIL**, **BLOCKED**, or **N/A with a reason** for every row. An empty checkbox is not evidence. A required row cannot be N/A merely because credentials, a browser, a preview, or a host are unavailable.

| Step                     | Required action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Evidence to record                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1. Freeze the target     | Record recipe ID, Cookbook revision, rendered preview revision and URL, intended visibility, every advertised variant and authentication path, reviewer, and date. Check current publication state rather than assuming a merge is deployed.                                                                                                                                                                                                                                                     | Revision and surface matrix.                                                                                         |
| 2. Cold first run        | Copy the rendered instructions into a fresh directory in order. No remembered credentials, SSH setup, undocumented edits, or manual recovery. Run the credential-free fixture path first where applicable. For integrate recipes, rebuild from the generated skill alone. For third-party recipes, use the named host. Stop at the first failure, fix the authored source, regenerate, and restart the affected walkthrough.                                                                     | Exact commands, environment versions, exit codes, and expected versus observed results.                              |
| 3. Live outcome          | With explicit authorization, run every demo query and advertised variant on an appropriate instance through the documented interface. Exercise the UI when one is shipped. Verify the actual outcome, not only a successful request. Keep sign-in user-controlled.                                                                                                                                                                                                                               | Instance and host, commands or UI actions, redacted outputs, and result for each expected behavior. No credentials.  |
| 4. Failure and safety    | Exercise invalid input, authentication/permission errors, service failures, malformed or wrong results, and cleanup failures as applicable. Check that unrelated errors cannot pass validation and a failed assertion cannot print success. Verify mutation ownership, retries, cleanup, and recovery instructions.                                                                                                                                                                              | Negative tests plus authorized live safety evidence where needed. Explain what mocks cannot prove.                   |
| 5. Developer writing     | Read title, summary, problem, prerequisites, steps, expected output, walkthrough, architecture labels, guardrails, limitations, next steps, README, and generated skill. Use the clear-writing skill when available; otherwise record the available writing guidance used. Remove prompt voice, unexplained jargon, redundant prerequisites, and mismatched promises. Make destructive behavior explicit before execution.                                                                       | Reviewed surfaces, concrete copy changes, and no unresolved reader-path defects.                                     |
| 6. Idiomatic composition | Map each supporting concern to its SDK, library, or runtime facility. Inspect actual calls, not just imports. Review custom OAuth, token storage, environment parsing, HTTP, retry, validation, and UI plumbing. Check that this is the approach we would recommend from scratch. Remove unnecessary mechanisms rather than patching around them. Replace duplication; retain thin adapters only for demonstrated gaps. Prefer Platform APIs and record any capability gap requiring a decision. | Package/version and responsibility map; reason, alternatives considered, and tests for each retained custom adapter. |
| 7. Generated surfaces    | Regenerate the registry and full plugin build. Walk the exact candidate page and applicable generated skill. Confirm that the raw authored command sequence works without rewriting, and that generated surfaces preserve its working-directory behavior, authentication choices, scopes, commands, and outcomes. Candidate preview must contain the reviewed changes, not an older main snapshot.                                                                                               | Build results, source-to-preview revision match, page and skill walkthrough results.                                 |
| 8. Regression checks     | Run the repository-required checks, focused recipe tests, lint, typecheck, install-script and dependency checks. Confirm a standalone clean install from its lockfile. Keep generated plugin/site output out of the recipe change.                                                                                                                                                                                                                                                               | Commands, exit codes, and final diff audit. Failures and unrun checks remain visible.                                |
| 9. Release decision      | Resolve all Blocks and all defects in the three required quality gates. Other Should-fix exceptions need explicit reviewer acceptance, rationale, owner, and review date. Record remaining polish. Set lastVerified only after the required live verification succeeds; name the verification owner and next review date.                                                                                                                                                                        | Completed checklist and explicit verdict tied to the candidate revision.                                             |
| 10. After deployment     | After an authorized merge, trace the existing scheduled sync and deployment. Read the production page, test intended discovery/navigation and related redirects, and check the distributed plugin where applicable. A 200 response, source visibility flag, or pending sync PR is not proof. Do not hand-write site pages or create companion publication PRs.                                                                                                                                   | Cookbook/site/deployed revisions, production URLs, discovery result, and distributed artifact result.                |

**Ready to deploy** requires steps 1–9 to pass for all applicable paths, with justified N/A rows only. Missing required evidence means **BLOCKED**; observed defects mean **FAIL**. **Deployed and verified** additionally requires step 10. A hidden recipe can be reviewed internally but cannot claim public availability. Public promotion requires the public page, listing, and plugin gates even if the previous visibility was preview.

Stop reviewing when the findings are actionable: implement the bounded fixes, rerun failed checks, and update this same record. Do not replace execution with repeated audits or create a second quality standard.

## Per-recipe evidence record

Copy this into the recipe's existing tracking issue or review record. Updating an external issue still requires authorization.

```markdown
Recipe / candidate revision:
Preview URL / rendered revision:
Reviewer / date / environment:
Variants / authentication paths:
Writing guidance used:

| Step                     | Status | Evidence | Blocker or exception / owner / next action |
| ------------------------ | ------ | -------- | ------------------------------------------ |
| 1. Target                |        |          |                                            |
| 2. Cold first run        |        |          |                                            |
| 3. Live outcome          |        |          |                                            |
| 4. Failure and safety    |        |          |                                            |
| 5. Developer writing     |        |          |                                            |
| 6. Idiomatic composition |        |          |                                            |
| 7. Generated surfaces    |        |          |                                            |
| 8. Regression checks     |        |          |                                            |
| 9. Release decision      |        |          |                                            |
| 10. After deployment     |        |          |                                            |

Verdict: FAIL / BLOCKED / READY TO DEPLOY / DEPLOYED AND VERIFIED
Verification owner / next review date:
```

## Detailed criteria

Score findings as Block, Should-fix, or Park. N/A rows require a reason. `site` rows apply when `hidden` is not true. Preview uses `?ff_recipe=<id>`. Hidden recipes have no docs page. `listed` rows apply when `isPublicRecipe` is true or public promotion is proposed. `live` rows apply whenever a recipe promises live behavior; deployability reviews cannot skip them. `launch` rows apply in launch mode only.

| Criterion                                                                                                                                                                | Gate                | Applies     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------- |
| Published page walked cold, in order, from the published ref                                                                                                             | Block               | site        |
| Generated `/cookbook:{id}` skill walked and says the same steps                                                                                                          | Block               | listed      |
| First printed command works with no token and no special env                                                                                                             | Block               | all         |
| If the app needs Glean, fixture/recorded run is the printed default                                                                                                      | Block               | runnable    |
| No working-but-undocumented path while the documented one is broken                                                                                                      | Block               | runnable    |
| Authored commands work in their documented shell sequence without renderer repair or hidden resets                                                                       | Block               | runnable    |
| Shared-layer fixes have a reproducer with valid source, or explicit shared-feature scope                                                                                 | Block               | all         |
| UI states which mode it is in                                                                                                                                            | Block               | runnable    |
| UI surfaces server errors; no 500 as empty state                                                                                                                         | Block               | runnable    |
| Sample buttons/nouns work in the mode that offers them                                                                                                                   | Block               | runnable    |
| No fake live mode; non-portable `start:live` dies naming the env var                                                                                                     | Block               | runnable    |
| Verify spawns the documented command                                                                                                                                     | Block               | runnable    |
| Verify loads `.env`; stop-the-server note before verify                                                                                                                  | Should-fix          | runnable    |
| Second person, one narrator, one human action per step                                                                                                                   | Block               | all         |
| Step titles name a human action                                                                                                                                          | Should-fix          | all         |
| Sign-in separate from leftover env; `--require` lists blanks                                                                                                             | Block               | all         |
| OAuth vs copy-`.env.example` as two exclusive sentences; keys commented                                                                                                  | Block               | all         |
| Tenant-sounding env names explained in place                                                                                                                             | Block               | all         |
| Expected results name on-screen outcomes                                                                                                                                 | Should-fix          | all         |
| No em dashes, glyphs, markdown, or bare emails in `recipe.json` prose                                                                                                    | Should-fix          | all         |
| No prereq the scaffold already satisfies                                                                                                                                 | Should-fix          | all         |
| UI leaks no files/env/endpoints/raw SDK JSON; errors are `error` + `hint`                                                                                                | Should-fix          | runnable    |
| `llmContext` within cap; `demoQueries` count and order unchanged                                                                                                         | Should-fix          | all         |
| Authored recipe files plus regenerated `registry.json`; full `pnpm build` only to render locally; no `plugin/shared`, `build/`, `.pluginpack`, or README table in the PR | Block               | all         |
| Generated skill contains no self-contradicting steps                                                                                                                     | Block               | listed      |
| `lastVerified` reset when `aiPrompt`/`llmContext` change                                                                                                                 | Should-fix          | all         |
| `demoQueries` answerable on the reader's own instance; no seeded corpus                                                                                                  | Block               | live        |
| Live copy claims only what holds on any corpus                                                                                                                           | Block               | live        |
| Citations present and grounded where promised                                                                                                                            | Block/safety        | live        |
| Off-corpus questions refuse or escalate; nothing invented                                                                                                                | Block/safety        | live        |
| If the recipe claims X, X is reachable in the UI                                                                                                                         | Block               | live        |
| Missing prerequisite scored BLOCKED, never a quiet pass                                                                                                                  | Block               | launch      |
| Each `codeAssets` path walked separately; labels match the UI                                                                                                            | Block               | dual-path   |
| Auth rail shows selected path scopes; `requiredScopes` match calls                                                                                                       | Block               | dual-path   |
| Agent never opens cookie-SSO URL; no `chatId` with `initialMessage`                                                                                                      | Block/safety        | web-sdk     |
| Secrets only in ignored `.env`, the auth library's secure store, or the host secret store                                                                                | Block/safety        | all         |
| `recipe.steps` non-empty; first documented action correct with no local server                                                                                           | Block               | third-party |
| Copy button copies the builder prompt, not `aiPrompt`                                                                                                                    | Block               | third-party |
| No clone-path instruction; instance value is the slug                                                                                                                    | Block               | third-party |
| Token path, secret store, shared-token warning consistent                                                                                                                | Should-fix          | third-party |
| No credit for an unrun host build; untested is not `limitations`                                                                                                         | Block               | third-party |
| Clean-machine plugin install + timed rehearsal                                                                                                                           | Block               | launch      |
| In-app polish (KPI vs pills, unlabeled inputs, spacing, missing preview)                                                                                                 | Park                | all         |
| Deliberate product cuts and deferred API migrations (not failures of a required gate)                                                                                    | Park                | all         |
| Local sandbox/firewall obstruction                                                                                                                                       | Park (not a defect) | all         |

Gold PRs: [#48](https://github.com/gleanwork/glean-cookbook/pull/48) C360, [#55](https://github.com/gleanwork/glean-cookbook/pull/55) onboarding, [#57](https://github.com/gleanwork/glean-cookbook/pull/57) on-call (with #56 first-run).
