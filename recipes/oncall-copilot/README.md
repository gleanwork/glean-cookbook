# On-call Copilot

An on-call dashboard that takes an alarm to a proposed action and puts a person
in front of that action. It runs on a recorded service catalog, runbook, and
incident history, so you can watch it work before connecting it to anything.

The useful part is what it refuses. It names a cause only when a past incident
backs it. The gate turns away an approver who is neither on call nor the service
owner. A proposal nobody approves in time escalates instead of executing. An
action the planner invented never reaches the approval card. The audit log
records each of those decisions.

## Run it

You need Node 20 or newer, and nothing else. The walkthrough replays recorded
Glean responses, so it needs no credentials and makes no network calls.

```bash
npm install
npm run verify:fixture
npm start
```

`verify:fixture` drives the whole flow from the command line and asserts each
refusal. `npm start` gives you the same paths in a browser, where you can click
through them yourself.

Live mode is an adaptation step, not a second demo. It will not triage these
sample alarms against an arbitrary Glean instance. See
[Point it at your own corpus](#point-it-at-your-own-corpus) before authenticating.

Quiet presentation mode (`npm run demo`) is for hosts that already have
`GLEAN_COOKBOOK_DEMO=true`. Do not offer it during a normal run.

## Three things to try immediately

**Fire the second alarm.** Click **No-precedent alarm · PAY-2232**. Ledger queue
saturation with no deploy in flight has no matching past incident, so the triage
card asserts no probable cause. The deploy runbook still sits at the top of the
evidence table, tagged `procedure`. The proposed action drops from **Draft fix
PR** to **File tracking ticket**, and `#eng-oncall` and the audit log both say
why.

**Try to approve something you're not allowed to.** Fire an alarm, switch
**Acting as** to the person who is neither on call nor the owner, and click
**Approve & execute**. The card warns you first, and the approval returns 403.
The audit log records the attempt against that actor, and the incident stays at
`awaiting-approval`. Who may approve comes from the recorded service catalog.

**Let the agent go off script.** Click **Off-script agent · PAY-2233**. The
recorded agent reply proposes `rollback-production-now`, which is not in the
action registry. In place of an approval card you get a note saying no action
was offered, and the refusal is in the audit log.

## Point it at your own corpus

`npm run start:live` calls Platform Search and Client Chat with the credentials
in `.env`. It cannot infer how your service catalog is organized. Adapt these
assumptions first:

1. `lib/registry.ts` searches for `"<service> service catalog entry"` and only
   accepts a result whose URL contains `/services/`. Its parser expects the
   snippet to include `Tech lead:`, `On-call this week:`, `Tier:`,
   `Dependencies:`, and an escalation sentence. Change the query, URL rule, and
   parser to match your catalog.
2. The recorded catalog stores display names rather than directory identities.
   `APPROVER_EMAIL_DOMAIN` converts a name such as `Priya Natarajan` to an email.
   Parse real email addresses or person entities before using this gate.
3. `lib/evidence.ts` treats URLs containing `/incidents/` as precedents and
   `/runbooks/` as procedures. Map those rules to your document types.
4. Set `WATCHED_SERVICES` to the services the webhook may accept. The dashboard
   buttons remain sample alarms for `payments-service`. Send an alarm for your
   service to `POST /webhook/pagerduty`.

Then authenticate and start live mode:

```bash
npm run login -- --email "you@company.com"
# Add GLEAN_AGENT_ID and use npm run login:agent for the agent path.
npm run start:live
```

The three registered actions are inert in both modes. Replace them with real
integrations only after preserving the registry, approval, expiry, and audit
checks.

## The design argument: relevance is not evidence

Ranking probable cause by retrieval relevance produces confident wrong root
causes, and it does so structurally rather than occasionally.

A canary alarm on `payments-service` retrieves the deploy-and-rollback runbook
at or near the top of any ranking, because that runbook is _dense with the
alarm's own vocabulary_: canary, rollout, error rate, authorization failure
rate, rollback. It is genuinely the most relevant document in the corpus. It
also contains no information whatsoever about why this particular deploy broke.
It is procedure.

Measured on the sample corpus:

| Alarm                       | Top-scoring document          | Score    | Matching precedent           |
| --------------------------- | ----------------------------- | -------- | ---------------------------- |
| `PAY-2231` canary           | PAY-2114 incident review      | 1.00     | yes, cause asserted          |
| `PAY-2232` queue saturation | **Deploy & Rollback Runbook** | **0.40** | no (0.20), no cause asserted |

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
matching precedent means no cause is asserted, which is a correct outcome rather
than a gap.

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

- **app-orchestrated** (default). This code runs a deterministic sequence and
  uses the model for one thing: turning selected evidence into a sentence. It
  never chooses the action or grades its own evidence.
- **glean-agent**. A Glean agent owns the plan via the Agent API. It proposes an
  action by id.

What does **not** move: evidence classification and the approval gate. Asking
the planner to grade its own evidence is asking the wrong entity, and an agent
that can describe arbitrary actions into existence is an agent with production
access whatever its prompt says. Click **Off-script agent · PAY-2233** to replay
an agent proposing `rollback-production-now` and watch the gate refuse it.

## Authorization, not authentication

**This recipe does not authenticate anyone.** The acting user is _asserted_ via
`INCIDENT_ACTOR` or an `X-Incident-Actor` header. Fixture mode accepts the header
because it has no credentials, network calls, or real actions. A live run
refuses it unless `INCIDENT_DEMO_MODE=true`. Leave that flag false when
connecting to a real instance.

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
