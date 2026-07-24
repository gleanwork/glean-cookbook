# index-custom-source

Bring an unsupported source into Glean with the Indexing API — documents, permissions, and people — and see it live in search. This recipe indexes the [`acme-corpus`](../../acme-corpus/) dataset (PACT-438), so it doubles as the seed script every other recipe's demo depends on.

## Run it

```bash
pip install -r requirements.txt
export GLEAN_INDEXING_API_TOKEN=...
export GLEAN_SERVER_URL=...
python seed.py       # registers the acme_corpus datasource, indexes documents + identities + employee profiles
python teardown.py   # deletes everything seed.py created (see caveat below)
```

## What this does

`connector.py` defines two connectors against `glean-indexing-sdk==1.0.0b2`:

- **`AcmeCorpusConnector`** (`BaseDatasourceConnector`) — reads every JSON file in `../../acme-corpus/documents/`, transforms each into a `DocumentDefinition` with a `DocumentPermissionsDefinition` built from that document's `permission` block (`allowed_groups` or `allowed_users`), and pushes the permission identities (`../../acme-corpus/people/*.json`) needed to evaluate those ACLs.
- **`AcmeCorpusPeopleConnector`** (`BasePeopleConnector`) — indexes the same cast as searchable employee profiles, a separate Glean capability from document permissions.

**Never allow-all.** Every document carries a real permission block — general company docs are `Acme-All-Employees`, a few (compensation bands, HR case notes, one person's onboarding checklist) are restricted, so the permissions story is demonstrable, not just claimed.

**Teardown caveat:** `glean-indexing-sdk==1.0.0b2` has no `datasources.delete()` call — verified by grepping every `def delete` in the installed `glean-api-client==0.12.20` package. `teardown.py` deletes every document, group, permission-user, and employee profile the seed created, but the `acme_corpus` datasource _registration_ itself is left in place (orphaned but harmless — `seed.py` re-populates it cleanly on the next run). To fully remove the datasource entity, use the Glean admin console.

## Verify

Search "Who's on call for payments-service?" as yourself, then as a user only in `Acme-Engineering` (e.g. Marcus Webb) — they should see it. Search for something in `hr-compensation-bands` as that same restricted user — it should return nothing, since they're not in `Acme-HR`.
