# acme-corpus/

The seed dataset every recipe's `demo_queries` resolve against. Built for **PACT-438**. Also doubles as the working code for the `index-custom-source` recipe (PACT-444) — the connector pattern here is exactly what that recipe walks through.

## What's here

```
documents/{engineering,hr,sales,finance,support}/*.json   29 documents
people/employees.json                                     the 5-person cast
people/groups.json                                         6 department groups
people/memberships.json                                    who's in which group
connector.py                                                AcmeCorpusConnector + AcmeCorpusPeopleConnector
seed.py / teardown.py                                       entrypoints
requirements.txt                                            glean-indexing-sdk==1.0.0b2, pinned
```

Each document JSON file has `id`, `title`, `department`, `view_url`, `created_at`/`updated_at` (ISO 8601 — `connector.py` converts to the epoch seconds the API expects), and a `permission` block:

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

## Running it

```bash
pip install -r requirements.txt
export GLEAN_INDEXING_API_TOKEN=...
export GLEAN_SERVER_URL=...
python seed.py       # registers the acme_corpus datasource, indexes documents + identities + employee profiles
python teardown.py   # deletes everything seed.py created (see caveat below)
```

**Teardown caveat:** `glean-indexing-sdk==1.0.0b2` has no `datasources.delete()` call — verified by grepping every `def delete` in the installed `glean-api-client==0.12.20` package. `teardown.py` deletes every document, group, permission-user, and employee profile the seed created, but the `acme_corpus` datasource _registration_ itself is left in place (orphaned but harmless — `seed.py` re-populates it cleanly on the next run). To fully remove the datasource entity, use the Glean admin console.

## Acceptance test (per PACT-438)

After seeding a test instance:

1. Every query in [`brand/FICTION.md`](../brand/FICTION.md)'s canonical pool should return a relevant, cited result.
2. Querying as **Marcus Webb** (`Acme-Engineering` + `Acme-All-Employees` only, no HR access) for something in `hr-compensation-bands` or `hr-investigation-notes` should return nothing — he's not in `Acme-HR`.
3. Querying as **Dana Okafor** (`Acme-HR`) for the same should surface those documents.
