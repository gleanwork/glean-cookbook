# Milestone 0 — Spec lock (PACT-452)

**Status:** LOCKED and implemented. Scoped per Steve's 8/3 steer ("you do not need to follow what
I specked out to the letter — make an exec decision and change it to make it make sense").

## Locked decisions

| Field                           | Value                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `id`                            | `incident-copilot`                                                                |
| `status` / `category` / `level` | `showcase` / `agent` / Advanced                                                   |
| `surfaces`                      | `["platform-api", "agents", "tools"]` — no `mcp`, per Steve 7/24                  |
| `requiredScopes`                | `["SEARCH", "CHAT", "AGENTS"]`                                                    |
| `authMethod`                    | `["client-api-oauth-or-token"]` — caller's own credential, no act-as              |
| `featured`                      | `true`                                                                            |
| Dual impl                       | Two orchestrators, one shell (see below)                                          |
| Pinned SDK                      | none — raw `fetch`, matching `onboarding-hub/platform-chat`                       |
| Demo                            | "Triage the payments canary alarm"                                                |
| Fiction                         | Sample Corp, `payments-service`, PAY-2231 modelled on the indexed PAY-2114 review |

Corpus is real and already indexed — no authoring needed, unlike `rfp-responder`:
`eng-payments-service-catalog` (the service registry), `eng-pay-2114-incident-review` (the
precedent), `eng-payments-deploy-rollback-runbook` and `eng-incident-response-runbook` (procedure),
`eng-payments-architecture` and `eng-oncall-rotation` (context). The catalog even specifies the
escalation window (30 minutes) and target (Priya Natarajan), so both are read rather than invented.

## Deviations from the ticket

| Ticket                                                         | Built                                                                                          | Why                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execute "as the approving user", per-person system permissions | App credential; gate is an app-level policy check                                              | Impersonation was removed from every recipe (`9a1d1ba`). Overstating this is the one genuinely dangerous thing this recipe could teach, so the README and `/api/config` both say `impersonation: false`.                        |
| Dual implementation as two apps                                | One app, two orchestrators (`lib/orchestrators/`)                                              | Steven's 7/31 sheet says both variants render into one shell. Duplicating a governance-heavy app twice would double the surface where the two could drift apart — and the whole point is that the gate is identical either way. |
| Full dashboard (7/31 sheet)                                    | "Little dashboard": queue, triage card, evidence table, approval gate, channel, audit log      | Steve, 8/3: "it is build out a _little_ dashboard thing." Dropped: MTTA/MTTR/approval-latency rollup strip, expiring-soon lane, end-of-shift handoff job, two-way channel sync. Listed as Extensions.                           |
| PagerDuty webhook                                              | `POST /webhook/pagerduty` with severity/service filters, driven by a committed fixture payload | Real PagerDuty adds an integration to configure and nothing to learn. The filter logic is the part worth reading.                                                                                                               |
| `first-custom-tool` for governed actions                       | Three simulated pre-registered actions                                                         | PACT-454 doesn't exist. The registry boundary is what matters and is real; the executors are inert so the recipe is safe to run live.                                                                                           |
| Postmortem "feeds the knowledge base"                          | Drafts a timeline; writing it back is an Extension                                             | Write-back needs the same missing custom-tool recipe.                                                                                                                                                                           |

## Design decisions made during the build

### Evidentiary role, not relevance

The ticket says "probable cause **ranked by evidence**." Implemented naively that means ranking
retrieved documents by relevance, which is actively wrong here and measurably so.

For the canary alarm, the deploy-and-rollback runbook scores **0.78** signature overlap and the
matching past incident scores **1.00** — fine. But for an alarm with no precedent (`PAY-2232`,
ledger queue saturation, no deploy in flight) the runbook is the **highest-scoring document at
0.40**, above every other result, while the only past incident falls to 0.20. A relevance-ranked
copilot confidently blames a deploy that never happened.

So documents carry an evidentiary role, derived from where they live in the corpus rather than
inferred from prose:

- **precedent** — a past incident whose signature matches. The only role that may support a claim
  about _cause_, because it is the only kind of document that records one.
- **procedure** — a runbook. May license a proposed _action_. Never a cause.
- **context** — catalog, rotation, architecture. Ownership and topology only.

No precedent above `PRECEDENT_THRESHOLD` means **no cause is asserted**. That is a correct outcome,
not a gap.

### A mutating action requires a supported cause

Not in the ticket; added because the first build made the gap obvious. With only the rule above,
`PAY-2232` still produced a "draft fix PR" card — because the deploy runbook mentions rollbacks, so
the action selector picked a mutating action. That is the same relevance-is-not-evidence mistake
reappearing one layer down.

Now a mutating action with no evidence-supported cause is **downgraded** to filing a ticket, with
the substitution posted to the channel and audited as a refusal. Enforced in `approval.ts`, not in
either orchestrator, so neither planner can negotiate it away. Visible substitution, never silent.

### Authorization, not authentication

The gate enforces _who may approve_ from the service catalog. It does **not** authenticate — the
acting user is asserted via `INCIDENT_ACTOR` or an `X-Incident-Actor` header. Those are different
problems, and a deployment must solve the second before trusting the first. Called out in the README
and in the header comment on `actorOf`, because a reader who copies this without noticing has built
an approval gate anyone can walk through.

### Expiry escalates, never auto-approves

Auto-approving on timeout would invert the entire point of a gate, so expiry moves the incident to
`escalated`, hands it to the catalog's escalation target, and executes nothing.

## Verification

`npm run verify:fixture` — 58 checks, no credentials, no network. Asserts the governance
(authz refusal + audit, expiry escalation without execution, unregistered action refused, mutating
action downgraded, failures surfaced, every attempt audited) and the evidence rules against the
corpus oracle.

Live harness at `scripts/verify/incident-copilot.mjs` per the repo convention — recipe dirs stay
copyable, queries come from `demoQueries` so assertions can't drift from claims, and it asserts only
corpus-independent invariants.

**A harness bug worth recording:** the first version restarted the server to change the acting user.
`child.kill()` on the `npx` wrapper does not kill the `tsx` grandchild, so `waitUp()` reconnected to
the _previous_ server and every authorization assertion passed against the wrong process — a false
green. Fixed by making the actor a per-request header and killing the process group.

## Deliverables

- [x] `recipes/incident-copilot/` runnable app, both orchestrators
- [x] `recipe.json` → `npm run build:registry`
- [x] `scripts/verify.mjs` (fixture) + `scripts/verify/incident-copilot.mjs` (live)
- [x] `ACCEPTANCE-MAP.md`
- [x] `docs/cookbook/incident-copilot.mdx` in glean-developer-site
- [x] Regenerated plugin skill
- [ ] Fable mockup → Frank He — skipped, as on `customer-360`. Confirm it's optional.
