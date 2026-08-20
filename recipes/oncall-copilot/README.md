# On-call Copilot

An incident copilot that triages from your own runbooks and past incidents,
proposes one action, and will not run it without an authorized approver.

The useful part is what it refuses. The gate turns away anyone who is not on
call. An unapproved proposal expires and escalates instead of executing. The
registry refuses an action id it does not know. The audit log records every
unauthorized approval, execution, and expiration.

## Run it

See the refusals first. No credentials, no network:

```bash
npm install
npm run verify:fixture
```

`verify:fixture` replays recorded sample-corpus responses. It is the only path
that proves the PAY-2231 / PAY-2232 evidence story end to end. To go straight
to your own content, skip it.

Live retrieval against your Glean instance:

```bash
npm run login -- --email "<work-email>"
# or npm run login:agent, then set GLEAN_AGENT_ID
npm start
```

`npm start` prints a Local URL. Live Search, Chat, and optional Agents calls hit
your index. Both alarm buttons fire `payments-service` and the webhook ignores
anything else, so a live run needs a catalog entry for that name whose URL
contains `/services/` and whose body names `Tech lead` and `On-call this week`.
Without it, the alarm is filtered or triage stops. Evidence roles come from
`/incidents/` and `/runbooks/` in URLs. Catalog names are mapped to
`@sample.example.com`, and the three registered actions stay in-process
simulations, so nothing is written back to your instance.

Quiet presentation mode (`npm run demo`) is for hosts that already have
`GLEAN_COOKBOOK_DEMO=true`. Do not offer it during a normal run.

## Two things to try immediately

These buttons use the bundled sample alarms. On a live instance they still fire
`payments-service`. If that catalog entry is missing, the alarm is filtered or
triage stops.

**Fire the second alarm.** Click **No-precedent alarm · PAY-2232**. On the
sample corpus, ledger queue saturation with no deploy in flight retrieves the
deploy runbook as the highest-scoring document. A relevance-ranked copilot
would blame a deploy. This one asserts no cause, and downgrades the proposed
fix to "file a ticket" in the in-app channel and the audit log.

**Try to approve something you're not allowed to.** Set `INCIDENT_ACTOR` in
`.env` to anyone who is not on call for the service, restart, and fire
PAY-2231. The card names who may approve and leaves **Approve & execute**
disabled. The allowed set is the on-call engineer and service owner parsed
from the catalog, not a config file.

That is the refusal you can see. The 403 itself only comes back over the API,
because the disabled button never sends a request. To read the status code,
start with `INCIDENT_DEMO_MODE=true` (incidents are in-memory, so do this
before you fire an alarm), fire PAY-2231, copy the new incident id, then:

```bash
curl -sS -i -X POST "http://127.0.0.1:<port>/api/approve" \
  -H "Content-Type: application/json" \
  -H "X-Incident-Actor: outsider@example.com" \
  -d '{"id":"<incident-id>"}'
```

The response is 403 and the refusal is audited, as long as that address is not
on the card's allow-list. Live still trusts the asserted actor until you add
authentication.

## The design argument: relevance is not evidence

Ranking probable cause by retrieval relevance produces confident wrong root
causes, and it does so structurally rather than occasionally.

A canary alarm on `payments-service` retrieves the deploy-and-rollback runbook
at or near the top of any ranking, because that runbook is _dense with the
alarm's own vocabulary_ — canary, rollout, error rate, authorization failure
rate, rollback. It is genuinely the most relevant document in the corpus. It
also contains no information whatsoever about why this particular deploy broke.
It is procedure.

Measured on the sample corpus:

| Alarm                       | Top-scoring document          | Score    | Matching precedent            |
| --------------------------- | ----------------------------- | -------- | ----------------------------- |
| `PAY-2231` canary           | PAY-2114 incident review      | 1.00     | yes — cause asserted          |
| `PAY-2232` queue saturation | **Deploy & Rollback Runbook** | **0.40** | no (0.20) — no cause asserted |

On the second alarm the runbook outranks everything. An LLM handed that ranking
will tell your on-call engineer, at 3am, that a deploy caused an incident that
happened while nothing was deploying.

So documents carry an **evidentiary role**, and roles have different powers:

| Role        | Example                                          | May support             |
| ----------- | ------------------------------------------------ | ----------------------- |
| `precedent` | a past incident review with a matching signature | a claim about **cause** |
| `procedure` | a runbook                                        | a proposed **action**   |
| `context`   | service catalog, rotation, architecture          | ownership and topology  |

Only a precedent can license a cause, because only a precedent records one. No
matching precedent means no cause is asserted — a correct outcome, not a gap.

Role is derived from where a document lives (`/incidents/`, `/runbooks/`), not
from what it says. Inferring a document's evidentiary standing from its prose is
exactly the inference this whole module exists to avoid. Map your own document
types in `lib/evidence.ts`.

Live verification cannot assert PAY-2114 or any other named document. It only
checks that a claimed cause cites a precedent, and that a code-changing action
is not offered without a supported cause.

### Mutating actions require supported causes

You cannot draft a fix for a cause nobody established. Without a supported
cause the action is downgraded to filing a ticket, posted to the channel and
audited as a refusal. This lives in `approval.ts` rather than in either
orchestrator, so neither planner can negotiate it away.

## What the gate actually enforces

| Property                                  | How                                                                                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only on-call + service owners may approve | Read from the indexed service catalog. 403 and audited otherwise.                                                                                                                         |
| Unapproved proposals expire               | Timer, on the window from the catalog → escalate to the catalog's target. **Nothing executes.**                                                                                           |
| Only pre-registered actions run           | The planner names an action _by id_. An unknown id is refused at proposal time, so a card offering an impossible action is never shown.                                                   |
| Mutating actions need a cause             | See above.                                                                                                                                                                                |
| Gate decisions are audited                | Unauthorized approvals, executions, failures, rejections, and escalations record the actor. Invalid-state requests and disabled demo affordances return errors without an audit row.      |
| Failures are loud                         | Action failures post to the in-app channel with the error. A governed action that fails silently is worse than one that never ran, because the channel now believes the ticket was filed. |

Watch the interesting ones with `SIMULATE_ACTION_FAILURE=draft-fix-pr` and the
**Force expiry → escalate** button.

## Two orchestrators, one shell

Both orchestrators live in `lib/orchestrators/` and render into the same
dashboard, so the only difference is _who owns planning_:

- **app-orchestrated** (default) — this code runs a deterministic sequence and
  uses the model for one thing: turning selected evidence into a sentence. It
  never chooses the action or grades its own evidence.
- **glean-agent** — a Glean agent owns the plan via the Agent API. It proposes
  an action by id.

What does **not** move: evidence classification and the approval gate. Asking
the planner to grade its own evidence is asking the wrong entity, and an agent
that can describe arbitrary actions into existence is an agent with production
access whatever its prompt says. Try the fixture alarm `PAY-2233`, where the
agent proposes `rollback-production-now` and gets refused.

## Authorization, not authentication

**This recipe does not authenticate anyone.** The acting user is _asserted_
via `INCIDENT_ACTOR`. `X-Incident-Actor` can override that only when the
process was started with `INCIDENT_DEMO_MODE=true`. Otherwise the header is
refused. Incidents live in memory, so changing the flag means starting a new
process and firing a new alarm.

That header, and `simulateFailure`, are refused unless `INCIDENT_DEMO_MODE=true`.
The example configuration leaves this false. Enable it only while exercising
the demo paths, then turn it off.

Authorization (who may approve) and authentication (proving you are that
person) are different problems. This solves the first. A deployment must solve
the second before trusting the first. Otherwise you have shipped an approval
gate anyone can walk through by setting a header.

Actions do **not** execute as the approving user. The executor is the app's own
credential and the gate is an app-level policy check. `/api/config` reports
`impersonation: false`; this recipe does not claim per-person permission
enforcement for action execution.

## Deliberately not solved

- **Persistence.** Incidents and the audit log are in-process. An audit log you
  can lose by restarting a process is not an audit log.
- **The rest of the dashboard.** No MTTA/MTTR rollup, expiring-soon lane,
  end-of-shift handoff, or two-way channel sync.
- **Real integrations.** The three registered actions are inert, so the recipe
  is safe to run against a live instance. The registry boundary is the real
  part.
- **Writing the postmortem back** to the knowledge base.
- **Exposing the copilot over Agent-to-Agent (A2A)**, which would let another
  agent trigger triage. See
  [A2A Client](https://developers.glean.com/cookbook/a2a-client).

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
