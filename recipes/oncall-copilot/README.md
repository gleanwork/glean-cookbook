# On-call Copilot

Triage an incident from your own runbooks and past incidents, propose exactly one
pre-registered action, and put a human in front of it.

The retrieval is the easy part. What makes this runnable in front of a production
service is everything that refuses: a gate that turns away the wrong person, an
expiry that escalates instead of quietly approving itself, an action registry the
planner cannot talk its way out of, and an audit entry for every attempt including
the ones that were refused.

## Run it

```bash
npm install
npm run verify:fixture   # 58 checks, no credentials, no network
npm start                # open the Local URL printed by the server
```

Run `verify:fixture` first. It runs the whole flow against recorded responses and
checks the approval gate, expiry, and audit behavior, so you can see those guarantees
hold before wiring up a token.

For live use, run `npm run login`. It creates `.env` and fills in `GLEAN_SERVER_URL` and
`GLEAN_API_TOKEN`. If OAuth is off, copy `.env.example` to `.env` and fill those two yourself
with a token that has the SEARCH and CHAT scopes. Then set `WATCHED_SERVICES` to the catalog
name of the service this copilot watches.

If an existing Glean agent should own the plan, run `npm run login:agent` so the token also
has the AGENTS scope, then set `GLEAN_AGENT_ID`.

## Two things to try immediately

**Fire the second alarm.** `PAY-2232` is ledger queue saturation with no deploy in
flight. The deploy runbook is the highest-scoring document retrieved, so a
relevance-ranked copilot blames a deploy. This one asserts no cause at all, and
downgrades the proposed fix to "file a ticket" — visibly, in the channel and the
audit log.

**Try to approve something you're not allowed to.** Set
`INCIDENT_ACTOR=alex.kim@sample.example.com` and approve. 403, audited against you,
incident unchanged. The allowed set is the on-call engineer and service owner read
from the indexed service catalog, not a config file.

## The design argument: relevance is not evidence

Ranking probable cause by retrieval relevance produces confident wrong root causes,
and it does so structurally rather than occasionally.

A canary alarm on `payments-service` retrieves the deploy-and-rollback runbook at or
near the top of any ranking, because that runbook is _dense with the alarm's own
vocabulary_ — canary, rollout, error rate, authorization failure rate, rollback. It
is genuinely the most relevant document in the corpus. It also contains no
information whatsoever about why this particular deploy broke. It is procedure.

Measured on the sample corpus:

| Alarm                       | Top-scoring document          | Score    | Matching precedent            |
| --------------------------- | ----------------------------- | -------- | ----------------------------- |
| `PAY-2231` canary           | PAY-2114 incident review      | 1.00     | yes — cause asserted          |
| `PAY-2232` queue saturation | **Deploy & Rollback Runbook** | **0.40** | no (0.20) — no cause asserted |

On the second alarm the runbook outranks everything. An LLM handed that ranking will
tell your on-call engineer, at 3am, that a deploy caused an incident that happened
while nothing was deploying.

So documents carry an **evidentiary role**, and roles have different powers:

| Role        | Example                                          | May support             |
| ----------- | ------------------------------------------------ | ----------------------- |
| `precedent` | a past incident review with a matching signature | a claim about **cause** |
| `procedure` | a runbook                                        | a proposed **action**   |
| `context`   | service catalog, rotation, architecture          | ownership and topology  |

Only a precedent can license a cause, because only a precedent records one. No
matching precedent means no cause is asserted — a correct outcome, not a gap.

Role is derived from where a document lives (`/incidents/`, `/runbooks/`), not from
what it says. Inferring a document's evidentiary standing from its prose is exactly
the inference this whole module exists to avoid. Map your own document types in
`lib/evidence.ts`.

### Mutating actions require supported causes

You cannot draft a fix
for a cause nobody established. Without a supported cause the action is downgraded to
filing a ticket, posted to the channel and audited as a refusal. This lives in
`approval.ts` rather than in either orchestrator, so neither planner can negotiate it
away.

## What the gate actually enforces

| Property                                  | How                                                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only on-call + service owners may approve | Read from the indexed service catalog. 403 and audited otherwise.                                                                                                                  |
| Unapproved proposals expire               | Timer, on the window from the catalog → escalate to the catalog's target. **Nothing executes.**                                                                                    |
| Only pre-registered actions run           | The planner names an action _by id_. An unknown id is refused at proposal time, so a card offering an impossible action is never shown.                                            |
| Mutating actions need a cause             | See above.                                                                                                                                                                         |
| Everything is audited                     | Requests, approvals, edits, rejections, executions, failures, refusals, escalations — with the actor.                                                                              |
| Failures are loud                         | Action failures post to the channel with the error. A governed action that fails silently is worse than one that never ran, because the channel now believes the ticket was filed. |

Watch the interesting ones with `SIMULATE_ACTION_FAILURE=draft-fix-pr` and the
"Force expiry" button.

## Two orchestrators, one shell

Both orchestrators live in `lib/orchestrators/` and render into the same dashboard,
so the only difference is _who owns planning_:

- **app-orchestrated** (default) — this code runs a deterministic sequence and uses
  the model for one thing: turning selected evidence into a sentence. It never
  chooses the action or grades its own evidence.
- **glean-agent** — a Glean agent owns the plan via the Agent API. It proposes an
  action by id.

What does **not** move: evidence classification and the approval gate. Asking the
planner to grade its own evidence is asking the wrong entity, and an agent that can
describe arbitrary actions into existence is an agent with production access whatever
its prompt says. Try the fixture alarm `PAY-2233`, where the agent proposes
`rollback-production-now` and gets refused.

## Authorization, not authentication

**This recipe does not authenticate anyone.** The acting user is _asserted_, via
`INCIDENT_ACTOR` or an `X-Incident-Actor` header, so you can watch the gate refuse
you without restarting anything.

That header, and `simulateFailure`, are refused unless `INCIDENT_DEMO_MODE=true`.
The example configuration leaves this false. Enable it only while exercising the
demo paths, then turn it off.

Authorization (who may approve) and authentication (proving you are that person) are
different problems. This solves the first. A deployment must solve the second before
trusting the first — otherwise you have shipped an approval gate anyone can walk
through by setting a header.

Actions do **not** execute as the approving user. The executor is the app's own
credential and the gate is an app-level policy check. `/api/config` reports
`impersonation: false`; this recipe does not claim per-person permission enforcement
for action execution.

## Deliberately not solved

- **Persistence.** Incidents and the audit log are in-process. An audit log you can
  lose by restarting a process is not an audit log.
- **The rest of the dashboard.** No MTTA/MTTR rollup, expiring-soon lane,
  end-of-shift handoff, or two-way channel sync.
- **Real integrations.** The three registered actions are inert, so the recipe is
  safe to run against a live instance. The registry boundary is the real part.
- **Writing the postmortem back** to the knowledge base.
- **Exposing the copilot over A2A**, which would let another agent trigger triage.

## Layout

| Path                 | What                                                 |
| -------------------- | ---------------------------------------------------- |
| `server.ts`          | Webhook, filters, routes                             |
| `lib/evidence.ts`    | Evidentiary roles, signature matching, cause ranking |
| `lib/registry.ts`    | Service registry: owner, on-call, escalation path    |
| `lib/triage.ts`      | Retrieval fan-out and card assembly                  |
| `lib/approval.ts`    | The gate: authz, expiry, escalation, mutation policy |
| `lib/actions.ts`     | The closed action registry                           |
| `lib/postmortem.ts`  | Timeline from recorded events                        |
| `lib/orchestrators/` | App-orchestrated and Glean-agent planners            |
| `lib/platform.ts`    | Platform Search / Chat / Agents, with fixture mode   |
| `public/index.html`  | The dashboard (safe DOM only, no `innerHTML`)        |
| `scripts/verify.mjs` | Fixture-mode gate                                    |

Tokens stay server-side; the browser only calls this app's own routes.
