# sample-data/

Fixtures for the `index-custom-source` recipe: a small set of documents, groups
and people standing in for an unsupported system, so the recipe has something
to index out of the box. Pure data — the connector that reads it is
[`../connector.py`](../connector.py).

This is sample data, not a shared corpus. No other recipe depends on it, and
nothing needs seeding before you run any recipe. If you have a real unsupported
source, point the connector at that instead — that's the actual use case this
recipe teaches.

## What's here

```
documents/{engineering,hr,sales,finance,support}/*.json   29 documents
people/employees.json                                     the 5-person cast
people/groups.json                                         6 department groups
people/memberships.json                                    who's in which group
```

Each document JSON file has `id`, `title`, `department`, `view_url`, `created_at`/`updated_at` (ISO 8601 — the connector converts to the epoch seconds the API expects), and a `permission` block:

```json
{ "permission": { "groups": ["Sample-All-Employees"] } }
{ "permission": { "groups": ["Sample-HR"] } }
{ "permission": { "users": ["alex.kim@sample.example.com", "dana.okafor@sample.example.com"] } }
```

## Permission model

Six groups: `Sample-All-Employees`, `Sample-Engineering`, `Sample-HR`, `Sample-Sales`, `Sample-Finance`, `Sample-Support`. Every cast member is in `Sample-All-Employees` plus their department group. Some documents are deliberately restricted, so a query run as one person returns them and the same query run as another returns nothing:

- **HR** (`hr-compensation-bands`, `hr-investigation-notes`) — restricted to `Sample-HR`.
- **Finance** (`finance-q3-budget-summary`) — restricted to `Sample-Finance`.
- One document (`hr-onboarding-checklist-alex-kim`) is restricted to specific users rather than a group, to demonstrate `allowed_users`.

## Seeding it

`connector.py`, `seed.py`, and `teardown.py` live one directory up, in [`../`](../) — see that recipe's README for how to run them and the teardown caveat (this SDK version has no `datasources.delete()` call).

## Checking a seed worked

After seeding a test instance:

1. Every document should be findable by a query drawn from its own title or body — search for `payments-service` and the service-catalog entry comes back cited.
2. Querying as **Marcus Webb** (`Sample-Engineering` + `Sample-All-Employees` only, no HR access) for something in `hr-compensation-bands` or `hr-investigation-notes` should return nothing — he's not in `Sample-HR`.
3. Querying as **Dana Okafor** (`Sample-HR`) for the same should surface those documents.
