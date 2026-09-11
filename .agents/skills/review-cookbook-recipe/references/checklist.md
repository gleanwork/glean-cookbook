# Cookbook review checklist

Load [SKILL.md](../SKILL.md) first. Apply the quality bar in
[AGENTS.md](../../../../AGENTS.md) and the canonical
[release lifecycle](../../../../CONTRIBUTING.md#release-and-verification-lifecycle).
This is the evidence record for those rules, not a second release policy.

## Required quality gates

1. **Recommended design:** the source teaches the supported, idiomatic approach we would
   recommend from scratch. Compose packages and runtime features; do not preserve a flawed
   design through unnecessary adapters, compatibility layers, or display repairs.
2. **Developer-facing writing:** the instructions are clear, accurate, actionable, and
   consistent across the authored page, README, execution metadata, and generated skill.
3. **Works as documented:** a developer can follow the actual deployed instructions from a
   fresh directory and obtain the promised result. Tests support, not replace, that evidence.

A ticket protects the intended outcome, not erroneous implementation details. Correct defects
with evidence. Reducing a promised capability or safety guarantee requires explicit scope-owner
approval; do not weaken an assertion to fit failing code.

## Ordered checks

Record PASS, FAIL, BLOCKED, or N/A with a reason per row and per advertised variant. Missing
credentials, tooling, or a required deployed page cannot be marked N/A. Separate the cause of a
failure from its verdict. An unsupported promised capability is not excused because the cause
is in the platform.

| Step                              | Action                                                                                                                                                                                                                                       | Evidence                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Scope and source               | Record the agreed outcome, source revision, build method, variants, auth paths, intended visibility, reviewer, and date. Review-only requests do not authorize implementation or publication.                                                | Scope and revision matrix; action authorization.                                    |
| 2. Design and writing             | Review code composition and every reader-facing section. Identify incorrect assumptions before choosing a fix. Correct the owning source; keep all authored surfaces consistent.                                                             | Package/responsibility map; writing guidance used; findings and rationale.          |
| 3. Local validation               | Run focused tests, negative checks, lint/typecheck, clean installs, and applicable repository checks. Test the raw command sequence without semantic rewriting. Keep fixtures separate from live evidence; a demo mode is optional.          | Exact commands, environment versions, exit codes, assertions, and diff audit.       |
| 4. Merge, sync, deploy for review | After an authorized reviewed merge, confirm the existing site sync and deployment expose the intended revision. Prefer preview for new unverified work. Do not create a companion site-content PR or hand-edit generated pages.              | Cookbook, site, and deployed revisions; rendered URL; sync/approval/check state.    |
| 5. Cold developer walkthrough     | Read the actual deployed page, then run every printed command in order from a fresh directory. Fill only documented inputs. Follow each variant separately. Stop at the first failure; do not inject local fixes or directory resets.        | Exact page commands and observed outcomes; first failure; who executed each step.   |
| 6. Live outcomes                  | Use the declared interface and an appropriate live instance to run every acceptance scenario. Exercise a shipped UI or named third-party host, not a local substitute. Use available authorized tools; hand off only user-required actions.  | Instance, host, auth path, expected versus observed behavior; no secrets.           |
| 7. Failure and safety             | Verify invalid input, auth/permission failures, wrong or empty results, service errors, mutation ownership, retries, cleanup, and recovery as applicable. Assertions must fail for the right reason.                                         | Negative tests and required authorized live safety checks; limits of mock evidence. |
| 8. Consumer agreement             | Confirm the generated page and applicable distributed skill preserve the source commands, scopes, and outcomes. Check intended navigation, discoverability, and redirects when publication or retirement is in scope.                        | Source-to-consumer revision match, actual URLs, generated/distributed checks.       |
| 9. Freshness and disposition      | Resolve required-gate defects. Record accepted nonblocking exceptions, owner, and next review date. Remove stale lastVerified evidence and restore the date only after the required live walkthrough succeeds.                               | Verification evidence, owner, next review date, and any approved scope change.      |
| 10. Decision                      | Report the actual lifecycle state and remaining blockers. A merge or deployment is not an end-to-end pass. Keep tracking open until its agreed publication, verified merge into another recipe, or explicit verified retirement is complete. | Scoped verdict and current lifecycle state.                                         |

Source review and local checks can establish **ready for review**, not live correctness. Steps
4–7 establish **end-to-end verified** only when the actual deployed workflow succeeds. To claim
**published and verified**, the public discovery and applicable distributed-plugin checks must
also pass. These states describe evidence, not permission to commit, merge, publish, or mutate.

A failed walkthrough restarts the correction loop at the owning source. Re-run affected local
checks, submit and merge with authorization, confirm the new deployment, and repeat the affected
cold walkthrough. Never carry an old pass across a change that invalidates it.

## Applicability and invariants

- **Hidden:** no deployed page or public skill. Internal scratch renders can support source
  and blind-build review without changing visibility; they cannot establish a deployed pass.
- **Preview:** use the deployed page with `?ff_recipe=<id>`. No public skill is expected. For
  integrate recipes, render candidate instructions internally from the matching source revision.
  Public promotion is a separate authorized decision and requires public consumer checks.
- **Public:** walk both page and applicable distributed skill. A listing is not proof of
  verification; inspect actual content and execute its commands.
- **Scaffold:** copy and run the supplied implementation. No regeneration from prose or
  hidden edits to the downloaded code.
- **Integrate:** blind-build from generated instructions, then test the resulting integration.
  A platform-only verifier is not an integration pass.
- **Third-party build:** use the actual builder prompt and host. A printed checklist or local
  scaffold cannot establish hosted verification.
- **CLI:** inspect command results; do not invent a browser URL or persistent process.
  **Web/hybrid:** keep required processes running and use their reported URLs. Verify UI claims.
- **Auth:** only the selected path and required scopes. Preserve cookie-SSO user handoff;
  never add token auth to it or automate the user's sign-in. Use each recipe's declared secure
  store, not a universal `.env` assumption. Never expose secrets in conversation or output.
- **Fixtures:** test appropriate offline behavior. Demo modes must be declared, clearly
  labeled, and explicitly selected. Honor the existing presentation-demo opt-in. Never use
  sample results as live evidence or suppress required tests when demo mode is off.
- **Source:** numbered commands share a shell unless explicitly stated otherwise. Fix raw
  commands and matching metadata. Shared-renderer fixes need a reproducer with valid source
  or explicitly requested shared-feature scope. Preserve the checker's valid safety checks.
- **Writing:** review all sections and expected outcomes. Use natural developer language and
  render-safe formatting. Do not enforce a fixed vocabulary or query count at the expense of
  correctness. Necessary paths, commands, and actionable errors are not debug clutter.
- **Acceptance:** examples may use equivalent real-instance topics. Preserve the expected
  response properties and safety guarantees; changes in count or wording do not authorize
  reducing capability.
- **Generated output:** regenerate, never hand-edit. Exclude generated recipe skills,
  manifests, build output, and generated README blocks from recipe PRs. Hand-authored shared
  instructions are a separate source concern.

## Per-recipe evidence record

Use the existing tracking issue or local review record; do not create a competing checklist.
Writing to an external issue requires authorization.

```markdown
Recipe / agreed scope:
Source revision / rendered revision / deployed URL:
Reviewer / date / environment:
Variants / authentication paths:
Writing guidance used:

| Step                              | Status | Evidence | Blocker / owner / next action |
| --------------------------------- | ------ | -------- | ----------------------------- |
| 1. Scope and source               |        |          |                               |
| 2. Design and writing             |        |          |                               |
| 3. Local validation               |        |          |                               |
| 4. Merge, sync, deploy for review |        |          |                               |
| 5. Cold developer walkthrough     |        |          |                               |
| 6. Live outcomes                  |        |          |                               |
| 7. Failure and safety             |        |          |                               |
| 8. Consumer agreement             |        |          |                               |
| 9. Freshness and disposition      |        |          |                               |
| 10. Decision                      |        |          |                               |

Scoped verdict: PASS / FAIL / BLOCKED
Lifecycle: ready for review / merged / deployed for review / end-to-end verified / published and verified
Verification owner / next review date:
```
