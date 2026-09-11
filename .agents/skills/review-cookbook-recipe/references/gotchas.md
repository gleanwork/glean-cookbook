# Cookbook review gotchas

Load [SKILL.md](../SKILL.md) first. These examples explain the canonical rules; they do not
create exceptions to AGENTS.md or CONTRIBUTING.md.

## Fix repeated directory changes in the recipe

A rejected fix added `humanizeStepCommands` to remove repeated `cd` prefixes when rendering
skills. It preserved defective source because a checker required independent commands.
Matching an existing site workaround did not make that decision correct.

Wrong in one shell:

```bash
cd example && npm install
cd example && npm test
```

Correct the recipe itself:

```bash
cd example && npm install
npm test
```

Update execution metadata and the conflicting checker assumption. Keep scaffold pinning and
initial-directory checks. A raw-command regression must fail on the old source; generated
output must preserve the corrected sequence. Stubbing external operations proves directory
behavior only, not live verification. Do not add a renderer repair or per-recipe exception.

## A green harness is not the developer outcome

Past failures included a fixture asserting a 403 while the dashboard made every reader an
approver, a verifier booting hidden `tsx` code instead of the printed `npm start`, and a Chat
check passing while the UI answered the wrong question. Exercise the interface the recipe
teaches. A working alternate path does not excuse a broken documented path.

Offline tests and optional demos are different. Do not require a demo mode merely because an
API call needs authentication. Do not skip documented offline tests when the presentation-demo
flag is off. Sample content is never evidence for a live answer.

## A merge or scheduled sync is not deployment evidence

Remote `registry:sync` reads a GitHub ref, not uncommitted files. A pushed candidate ref can
support a preview; do not describe it as an unpushed preview. Check which revision the rendered
page and downloaded code actually contain. A sync PR can wait for approval even with auto-merge
enabled. HTTP 200 can contain a gated or not-found page.

After the actual sync/deployment, read the page and execute its steps cold. Source inspection
and a local render remain separate evidence. Never hand-edit generated MDX to publish a fix.

## Visibility does not certify quality

Hidden recipes have no deployed page or public skill. Preview recipes use `?ff_recipe=<id>`
and are omitted from public plugin discovery. Public recipes require actual page and
applicable distributed-skill checks. An internal candidate render can support review of a
hidden/preview integration, but is not a distributed artifact. Do not flip visibility to make
a check pass. Promotion, merge into another recipe, and retirement are explicit decisions.

## Scaffolding must not depend on a maintainer's machine

An SSH-only clone can pass on a maintainer's machine and fail for a developer without SSH
credentials. Use the documented public HTTPS scaffold path and pinned noninteractive tooling.
Run without remembered credentials or Git URL rewrites that silently repair the command.
Likewise, a remembered `.env` cannot fill undocumented configuration on the reader's behalf.

## Auth and SDK behavior belong to their supported interfaces

Do not assume that every login command writes `.env`, or that every recipe uses the same
variable names. Some auth libraries store refreshable credentials outside the project;
cookie SSO uses the user's browser; hosted apps use host secret stores. Follow the selected
recipe's documented contract.

A future-looking scope name or API field is not evidence of current support. Check current
SDK/docs and the intended instance before adding compatibility machinery. Do not hand-roll
OAuth or parse a response stream when the supported package already does it. Field casing
and auth rules may differ across API surfaces; do not apply global renames or scope unions.

## Acceptance is about outcomes, not frozen prose

A supplied spec can contain an incorrect command or obsolete API assumption. Correct that
source with evidence while preserving the agreed outcome. Query wording, order, or count is
not immutable, but reducing promised behavior or safety requires explicit approval. Never
replace a failing content-integrity assertion with a weaker download check just to get green
verification without agreeing that scope change.

## Verification dates are evidence

The schema accepts a date or an absent `lastVerified` property, not the string `unset`.
Remove stale evidence when behavior-affecting changes invalidate it. A scheduled check, a
fixture pass, or an old revision's result cannot restore the date.
