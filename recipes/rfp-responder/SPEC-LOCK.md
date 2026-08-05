# Milestone 0 — Spec lock (PACT-451)

**Status:** LOCKED and implemented. Auth model settled (§Auth model). Open items resolved per Steve's
8/3 steer ("you do not need to follow what I specked out to the letter — make an exec decision"):
MCP variant dropped (fix the deck instead), write-back deferred to Extensions, corpus authored
rather than extended. Two design findings below changed the build materially.

**FYI:** Platform-only surfaces (Search + Chat). No Client `/rest/api/v1/*`.

## Locked decisions

| Field                           | Value                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                            | `rfp-responder`                                                                          |
| `status` / `category` / `level` | `showcase` / `workflow` / Intermediate                                                   |
| `surfaces`                      | `["platform-api", "tools"]`                                                              |
| `requiredScopes`                | `["SEARCH", "CHAT"]` (+ tools scope once write-back lands)                               |
| `authMethod`                    | `["client-api-oauth-or-token"]` — reviewer's own credential, no act-as                   |
| `combines`                      | `permissions-aware-retrieval` (per-question retrieval + answer); write-back TBD          |
| Demo query                      | "Draft answers to the Globex security questionnaire"                                     |
| Code layout                     | `recipes/rfp-responder/` (single impl — see open decision 2)                             |
| `goDependency` / `featured`     | both `false`                                                                             |
| Pinned SDK                      | `@gleanwork/api-client@0.18.0` (matches every other recipe on main)                      |
| Language                        | TypeScript                                                                               |
| Persona                         | `sam.reyes@sample.example.com` (Account Executive) — verified in `people/employees.json` |
| Fiction                         | Sample Corp responding to a Globex questionnaire                                         |

**Brand:** Glean's own branding. The Acme brand kit and `brand/FICTION.md` were retired in
`5263757`; `brand/` is styling tokens only. Do **not** reintroduce the retired `Acme teal #0E8C84`
or `@acme.example.com` values. Corpus domain is `sample.example.com`.

## Auth model — DECIDED (impersonation is gone)

PACT-451 step 3 says run each question "as the acting user." Act-as does not exist anymore
(`9a1d1ba` removed impersonation from every recipe; `5b780e6` rebuilt permissions-aware retrieval
around the reader's _own_ OAuth credential). **Decision: the reviewer's own credential is the
permission boundary.** No act-as, no service-account fan-out.

Consequences to build to, and to state plainly on the docs page:

- The app is **single-user**. One reviewer, their token, their permission boundary. There is no
  "run this questionnaire on behalf of the security team" mode.
- Retrieval is bounded by what _that reviewer_ can see. Step 3 of the ticket needs rewording.
- The pitch changes from "per-person enforcement across users" to **"the drafter's own credential is
  the permission boundary."** For an RFP tool that is arguably the stronger claim, not a weaker one:
  an AE cannot launder restricted content into a customer-facing document, because content they
  can't see never enters the prompt.
- The `Sample-Sales` ACL demo is unaffected and becomes the proof: run as a non-sales caller and the
  security rows collapse to "needs SME" instead of answering.
- Tokens stay server-side. Single-user does **not** mean ship a browser-side token.

## Open decisions

1. **MCP variant?** Steven Kim's 7/31 sheet adds an MCP variant ("same agent invoked over MCP from
   Claude Code or Cursor, no custom UI"); PACT-451 says "Single implementation … no dual variant
   here." The B4 deck's closing slide maps RFP → API and on-call → MCP. If the sheet wins, this
   becomes a dual impl and `surfaces` gains `mcp`. Changes layout and estimate. Current
   recommendation: leave RFP API-only and fix the deck slide instead.
2. **Write-back dependency.** Step 6 needs `first-custom-tool` (PACT-454), which does not exist in
   `recipes/`. Either sequence it first or ship export-only for GO and add write-back after.
   Recommendation: export-only for GO, write-back in Extensions.
3. **Corpus authoring is in scope.** See below — the questionnaire the ticket references doesn't
   exist as a questionnaire. This is real work that isn't in the estimate.

## Corpus reality check

PACT-451: "the Globex security questionnaire (~20 rows, lives in acme-corpus)."

Actual: `examples/sample-catalog/sample-data/documents/sales/sales-globex-security-questionnaire.json`
is a **913-byte prose summary**, not a 20-row questionnaire. `acme-corpus/` no longer exists (it is
now `examples/sample-catalog/`).

That one doc yields exactly six groundable claims:

| Claim                 | Value                              |
| --------------------- | ---------------------------------- |
| SOC 2 Type II         | provided, renewed annually         |
| Encryption at rest    | AES-256                            |
| Encryption in transit | TLS 1.2+                           |
| Data residency        | US-only                            |
| SSO                   | SSO/SAML supported                 |
| Breach notification   | 24-hour SLA, documented IR process |

Weak adjacent evidence: `support/support-sso-password-reset.json`,
`support/support-it-helpdesk-faq.json`, `engineering/eng-incident-response-runbook.json`.

Nothing in the corpus covers ISO 27001, subprocessors, retention/deletion, pen testing, BYOK/CMEK,
RTO/RPO, or insurance.

**This is a feature, not a problem.** The confidence flag and "needs SME" routing are load-bearing
per the ticket, and they can only be demoed honestly if some rows genuinely cannot be answered. The
input fixture is therefore designed around a deliberate grounding distribution — see
`fixtures/README.md`.

**Recommended (not yet done):** add 2–3 security-posture docs to the corpus so the strong-grounding
set isn't a single document — a subprocessor list, a data retention/deletion policy, and a
pen-test/vuln-management summary. Keep ISO 27001, BYOK, and RTO/RPO **unanswerable on purpose**.

**Permission-differentiated demo comes free:** `sales-globex-security-questionnaire` is restricted to
group `Sample-Sales`. A caller outside that group retrieves nothing, so every security row must come
back "needs SME" rather than fabricated — exactly the `permissionDifferentiated: true` demo query
pattern already used in `permissions-aware-retrieval/recipe.json`.

## Flow (from the ticket, 7 steps)

1. Upload xlsx / docx / Sheet link → enumerate tabs → user confirms question column + answer column.
2. Extract and **deduplicate** questions → show parsed list → confirm before any API call runs.
3. Batch each question through Chat with a progress bar. Custom instructions constrain answers to
   approved sources and a copy-paste-ready tone.
4. Review grid per row: draft answer, citations, **confidence flag** (strong vs weak grounding).
5. Per row: accept / edit inline / **regenerate with steering** (add context, restrict source,
   shorten). Duplicates inherit the accepted answer.
6. **Export** (xlsx/docx, original structure preserved) or **write-back** custom action, both behind
   an explicit confirm + approval log.
7. Accepted pairs → **answer library** for pre-fill on the next RFP. Unanswerable → **"needs SME"**
   with an assignment field. Never a fabricated answer.

Non-negotiable per the ticket: citations on every answer, the reviewer approval step, the confidence
flag, and the answer-library reuse loop.

### Confidence flag definition — REVISED during implementation

Originally specced as one axis (topicality). Building it surfaced that this is wrong: an internal IT
support article can be the single most on-topic document for a question and still be unusable as
customer-facing evidence. Term overlap cannot detect that, because the problem isn't linguistic.

Final: **two independent axes.**

- **strong** — an _approved_ source (declared in `lib/approved-sources.ts`) that addresses the
  question directly (term overlap ≥ 0.34).
- **weak** — on topic but the best source is internal, _or_ approved but only adjacent. The reason
  string distinguishes the two so the reviewer knows what to check.
- **none** → force "needs SME". Never render a draft answer, and refuse to accept the row.

Approval is **declared, not inferred**. That list is something a customer owns and reviews with
their security team; deriving it from a relevance score would have been the mistake.

### Dedup — REVISED during implementation

Specced as "deduplicates questions," which implies similarity scoring. Measured on the fixture:

| Pair                                                                                       | Score    |
| ------------------------------------------------------------------------------------------ | -------- |
| "encrypted **at rest**" vs "encrypted **in transit**" — must NOT merge                     | **0.60** |
| "encrypted at rest" vs "describe your at-rest encryption, incl. key length" — should merge | 0.29     |
| cross-tab identical SSO question — safe to merge                                           | 1.00     |

The false positive outranks the true positives, so no threshold is safe: any cutoff that catches the
real duplicate also merges at-rest with in-transit encryption, i.e. misstates a security control to
a customer in writing.

Final: auto-merge **normalized-exact matches only**; use similarity purely to order a manual-merge
candidate list. The score is never a verdict. Consistent with the recipe's whole thesis — when the
machine can't be sure, a human decides.

Empty retrieval **must** produce a refusal, not a model-knowledge answer. This is the same property
`permissions-aware-retrieval` exists to demonstrate, and it is the honest answer to the deck's
Recipe 03 ask ("everyone has seen an RFP bot — what's materially different here?"). The differentiator
is the failure contract, not the happy path.

## Contracts

Follow `customer-360/SPEC-LOCK.md`, which is verified against OpenAPI + SDK 0.18.0:

| Surface | Call                                      | Wait semantics                 |
| ------- | ----------------------------------------- | ------------------------------ |
| Search  | `glean.search.query` → `POST /api/search` | sync `PlatformSearchResponse`  |
| Chat    | raw `fetch` → `POST /api/chat`            | sync JSON when `stream: false` |

Chat request `{ input, stream: false, store: true }`; parse `output[].content[]` where
`type === 'output_text'` → `text` + `annotations[].sources[]` (`title`, `url`).
Requires `X_GLEAN_INCLUDE_EXPERIMENTAL=true` and `platform.apiMigratedEndpointsEnabled`.

**Security:** tokens and Glean calls stay server-side; browser only hits local recipe routes. Build
the UI with safe DOM APIs and URL validation from the start — Chris had to retrofit an
`innerHTML` → safe-DOM XSS fix on both of his recipes. Don't repeat it.

## Verification

Fixture-first, matching both shipped recipes: commit fixtures + `scripts/verify.mjs` with fixture and
live modes. Live verification against QE needs the experimental Platform handlers, which weren't
available for Chris's PRs. Fixture mode is the CI gate.

## Non-goals (Extensions only)

- Write-back custom action (until PACT-454 lands)
- Multi-questionnaire portfolio view
- SME assignment notifications / routing integrations
- CRM or Highspot sync

## Deliverables

- [x] `recipes/rfp-responder/` runnable app (server + fixtures + verify + UI + README)
- [x] `fixtures/` questionnaire input + grounding map + recorded Chat responses
- [x] `recipe.json` → `npm run build:registry` (never hand-edit `registry.json`)
- [x] `ACCEPTANCE-MAP.md`
- [x] `docs/cookbook/rfp-responder.mdx` in glean-developer-site — on branch `rwjblue/cookbook-rfp-responder`.
      Correction to the earlier note: pages DO carry a small frontmatter block plus `RecipePage` /
      `RecipeSection` / `RecipePrereqs` / `RecipeSteps` / `TakeItFurther` imports. Steps, prereqs and
      metadata render from `recipe.json`; the mdx supplies only prose the registry can't hold.
- [x] Regenerated `plugin/plugins/cookbook/skills/rfp-responder/SKILL.md` (via `plugin/ npm run generate:commands`)
- [x] `scripts/verify/rfp-responder.mjs` — repo-level live harness, per Steve's newer convention
      (recipe dirs stay copyable; the maintainer harness reads `demoQueries` so the two can't drift)
- [ ] Fable mockup → Frank He (listed on the ticket; Chris skipped it on customer-360 — confirm
      whether it's actually optional)
