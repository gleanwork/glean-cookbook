# acme-corpus/

The seed dataset every recipe's `demo_queries` resolve against. Built for **PACT-438**. The connector code that indexes this data now lives in [`../recipes/index-custom-source/`](../recipes/index-custom-source/) (PACT-444) — this directory is pure data.

## What's here

```
documents/{engineering,hr,sales,finance,support}/*.json   29 documents
people/employees.json                                     the 5-person cast
people/groups.json                                         6 department groups
people/memberships.json                                    who's in which group
```

Each document JSON file has `id`, `title`, `department`, `view_url`, `created_at`/`updated_at` (ISO 8601 — the connector converts to the epoch seconds the API expects), and a `permission` block:

```json
{ "permission": { "groups": ["Acme-All-Employees"] } }
{ "permission": { "groups": ["Acme-HR"] } }
{ "permission": { "users": ["alex.kim@acme.example.com", "dana.okafor@acme.example.com"] } }
```

## Permission model

Six groups: `Acme-All-Employees`, `Acme-Engineering`, `Acme-HR`, `Acme-Sales`, `Acme-Finance`, `Acme-Support`. Every cast member is in `Acme-All-Employees` plus their department group. Two departments have a restricted document set for permissions-aware-rag to demonstrate against:

- **HR** (`hr-compensation-bands`, `hr-investigation-notes`) — restricted to `Acme-HR`.
- **Finance** (`finance-q3-budget-summary`) — restricted to `Acme-Finance`.
- One document (`hr-onboarding-checklist-alex-kim`) is restricted to specific users rather than a group, to demonstrate `allowed_users`.

## Seeding it

The connector, `seed.py`, and `teardown.py` live in [`../recipes/index-custom-source/`](../recipes/index-custom-source/) — see that recipe's README for how to run them and the teardown caveat (this SDK version has no `datasources.delete()` call).

## Acceptance test (per PACT-438)

After seeding a test instance:

1. Every query in [`brand/FICTION.md`](../brand/FICTION.md)'s canonical pool should return a relevant, cited result.
2. Querying as **Marcus Webb** (`Acme-Engineering` + `Acme-All-Employees` only, no HR access) for something in `hr-compensation-bands` or `hr-investigation-notes` should return nothing — he's not in `Acme-HR`.
3. Querying as **Dana Okafor** (`Acme-HR`) for the same should surface those documents.
