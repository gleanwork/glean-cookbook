---
name: review-cookbook-recipe
description: >-
  Reviews Glean cookbook recipes for reference-quality design, developer-facing
  writing, documented execution, and end-to-end verification. Use when reviewing
  recipe.json, a Cookbook page, a generated recipe skill, a first run, or recipe
  publication readiness.
license: MIT
---

# Review a cookbook recipe

Review the implementation we would recommend to a developer starting from scratch, not a
demo repaired until it passes. A narrower copy or code review is useful, but cannot establish
end-to-end verification.

## Authority and scope

- [AGENTS.md](../../../AGENTS.md) owns the quality bar and source-first correction rules.
- [CONTEXT.md](../../../CONTEXT.md) defines the domain terms.
- [CONTRIBUTING.md](../../../CONTRIBUTING.md) owns authoring, executable checks, and the
  [release lifecycle](../../../CONTRIBUTING.md#release-and-verification-lifecycle).
- [references/checklist.md](references/checklist.md) is the execution/evidence record.
- [references/gotchas.md](references/gotchas.md) records known traps, not alternative rules.

Confirm the requested scope: review-only, implementation, or release verification. A review
request does not authorize edits, commits, pushes, merges, live mutations, or communications.
When implementation is authorized and findings are actionable, make bounded corrections and
rerun the affected checks rather than repeatedly producing new audits.

## Choose the correct fix

State the intended developer outcome and the supported, idiomatic way to achieve it. Identify
which assumption or design choice caused the failure; do not assume the existing design must
be preserved. Distinguish bad authored source, a consumer mishandling valid source, and a stale
generated/deployed revision.

Correct the owning source. Do not repair command semantics in a renderer, add hidden directory
resets, or keep unsupported behavior behind a compatibility wrapper. Correct a conflicting
checker assumption while retaining its valid safety checks. Shared-layer changes require a
minimal failure with valid authored input or an explicitly requested shared feature.

A spec or ticket protects the agreed outcome, not defective commands or assumptions. Correct
errors with evidence. Do not weaken the promised capability, safety guarantees, or acceptance
criteria to fit the implementation without explicit scope-owner approval.

## Walk the developer path

1. Record the source revision, build method, variants, authentication paths, and intended
   visibility. Review source design and copy and run applicable local checks before submission.
2. After an authorized merge, trace the existing sync and deployment. Confirm the rendered page
   and downloaded code correspond to the intended revision. Do not infer deployment from a
   visibility flag, HTTP 200, merge, or successful sync workflow alone.
3. Read `developers.glean.com/cookbook/<id>` cold. For a preview, use `?ff_recipe=<id>`.
   Follow every rendered step from a fresh directory, filling only documented inputs. Record
   the first failure before diagnosing it. Local source is for diagnosis, not substitute
   evidence for the deployed walkthrough.
4. Treat numbered commands as one shell session unless a new one is explicitly documented.
   Test the raw authored sequence without rewriting and confirm the generated instructions
   preserve it. `--help` or a fixture assertion is not the promised developer outcome.
5. Exercise the actual interface and every advertised variant. For a CLI, execute its commands
   and check results; for an app, exercise the UI; for a host configuration, use that host.
   Use available authorized tools yourself. Hand off only actions requiring user participation,
   such as sign-in, cookie SSO, or a host operation the tools cannot perform.
6. For a public recipe, walk the generated and distributed `/cookbook:<id>` skill too. Verify
   commands, authentication, scopes, outcomes, and public discoverability. Do not mark the
   tracking issue Done until its agreed publication, merge, or retirement is verified.

### Build-method differences

- **Scaffold:** run the literal scaffold and package commands. Check clean installation,
  declared runtime versions, pinned dependencies, and install-script policy. Do not regenerate
  code from prose or silently patch the downloaded project during the reader pass.
- **Integrate:** rebuild blindly from generated instructions, not by reading and repairing the
  reference implementation. Test the resulting integration in the declared environment.
- **Third-party build:** use the named host and the `pastePromptFile`/copied builder prompt,
  not a local substitute or an agent-only prompt. Verify the hosted result. Missing host access
  is BLOCKED, not a reason to assert success or automatically delegate the whole test to the user.

Hidden recipes have no deployed page or public skill. An internal scratch render from the
existing recipe-skill renderer can support source and blind-build review without changing
visibility. Preview integrations can use such a render from the matching source revision.
These are not distributed-plugin passes. An authorized deployed preview is required before
claiming end-to-end verification of a hidden candidate.

### Tests and optional demos

Offline tests are required where appropriate, but a demo mode is not mandatory for every
recipe. For existing presentation demos, honor the documented `GLEAN_COOKBOOK_DEMO` opt-in and
verify that the recipe actually supports the demo command. Do not substitute sample results
for live behavior, invent a demo mode, or skip required offline tests because demo mode is off.
Any offered mode must be labeled and its controls must work in that mode.

## Review all reader-facing writing

Read title, summary, problem, prerequisites, steps, expected results, walkthrough, architecture
labels, guardrails, limitations, next steps, README, and generated skill. Use the clear-writing
skill when available; otherwise record the writing guidance used.

Use direct developer language, consistent terminology, and actionable step titles. Explain
what happens and what success looks like. Keep agent-only directions in agent fields. Remove
unexplained jargon, internal harness language, redundant prerequisites, and false promises.
Formatting must render correctly on each surface; punctuation or a fixed phrase list is not
a substitute for judging clarity. Keep necessary commands, paths, and actionable errors visible.

Separate authentication alternatives. State which values the login library supplies, what the
developer must configure, and where credentials are stored. Explain permanent writes/deletes
before execution. Code, steps, execution metadata, README, and expected behavior must agree.

Acceptance examples may be corrected or extended with a documented reason. Preserve the
agreed capability and safety requirements; never rewrite assertions merely to get a pass.

## Review idiomatic composition and safety

Map supporting concerns to the SDKs, packages, and runtime features that should own them.
Inspect actual calls, not just dependency names. A small imperative workflow is appropriate;
a replacement OAuth client, token store, `.env` parser, HTTP layer, or response-stream parser
needs a demonstrated gap in supported facilities. Remove unnecessary mechanisms. Keep any
justified adapter small, documented, and tested. Verify current API and scope support.

- Use only the selected path's authentication and minimum required scopes. Never combine
  scopes across variants or add API tokens to a cookie-SSO path.
- Keep secrets in the declared ignored environment file, secure auth-library store, or host
  secret store. Never request, log, or paste secret values in conversation or commands.
- Cookie SSO uses the user's normal signed-in browser. Do not open or automate that path.
  For other browser paths, use authorized tools where available. Record who verified each action.
- Verify permission boundaries, expected invalid-input errors, failure output, mutation
  ownership, retry safety, cleanup, and recovery. An unrelated exception must not count as
  successful validation. A partial failure must not print success.
- Use appropriate topics from the actual instance. Do not require a seeded corpus or claim
  named fixture facts as live evidence. Check grounding, citations, refusals, and approval
  boundaries wherever promised. Never bypass safety properties to make verification pass.
- Missing review credentials or tooling means BLOCKED. Reproduced failure of a promised
  capability means FAIL, even when caused by the platform. Record cause separately.

## Source and generated output

Edit authored recipe files and rebuild `registry.json`; never hand-edit generated output.
Run a full build in scratch when inspecting skills. A recipe change must not include generated
recipe skills, marketplace manifests, build output, or generated README blocks. The conventions
skill and plugin partials are hand-authored shared instructions; changing them is a separate
shared-instruction concern, not permission to edit generated recipe skills.

Remote site sync sees a pushed GitHub ref, not local uncommitted changes. If using an internal
candidate preview, record its exact ref and rendering method; it does not replace the actual
post-merge developer-site run. No companion site-content PR is needed.

Remove `lastVerified` when changes invalidate the recorded path. Do not write the literal
string `unset`. Restore the date only after the required deployed-page and live checks pass.

## Evidence and report

Use the ordered checklist. Record PASS, FAIL, BLOCKED, or N/A with a reason for each applicable
check. Keep local checks, user-reported checks, agent-executed checks, and unrun checks distinct.
A subagent assessment or a green test suite alone cannot establish end-to-end verification.

Findings use **Block** (broken instructions/outcome or unmet required gate), **Should-fix**
(a defect outside required acceptance that does not prevent success), or **Park** (polish).
Never waive safety or the three required quality gates. Other exceptions require reviewer
acceptance, rationale, owner, and review date. A missing prerequisite is a blocker, not polish.

Report the current lifecycle state, scoped verdict, revisions, findings with evidence, and
remaining blockers. Do not equate ready for review, merged, deployed for review, end-to-end
verified, or published and verified. No further changes are authorized by the report itself.
