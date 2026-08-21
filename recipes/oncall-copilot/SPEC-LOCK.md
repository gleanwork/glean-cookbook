# On-call Copilot — spec lock

Triage an alert using a recorded service catalog, runbooks, and incident history.
Propose only pre-registered actions and require explicit human approval before
execution. The default run uses fixtures. Live mode requires the reader to adapt
catalog lookup, identity parsing, and evidence roles to their corpus.

## Evidence model

- Resolve the service owner, on-call engineer, escalation target, and approval window from the
  service catalog before triage.
- A matching past incident is a **precedent** and may support a cause.
- A runbook is **procedure** and may support an action, never a cause.
- Other retrieved documents are context only.
- No matching precedent means no asserted cause and no mutating action.

## Contracts

- Platform Search retrieves evidence; Client Chat synthesizes; Platform Agents is an optional
  orchestration path.
- Client Chat verification sets `saveChat: false`; empty output is a retryable failure.
- Approval is limited to the resolved on-call engineer and service owners.
- Fixture mode may assert an acting user so the dashboard can demonstrate a 403.
  Live mode refuses that header unless the explicit demo flag is enabled.
- Proposals expire into escalation without execution.
- Every request, refusal, approval, expiry, execution, and failure is audited.
- The app runs as the caller. Approval identity is an application policy check, not impersonation.

## Verification

Exercise matching precedent, no precedent, unauthorized approval, expiry, and unregistered action.
`VERIFY_SERVICE` selects a service from the reader's catalog and must also be included in the
server's watched-service set.
