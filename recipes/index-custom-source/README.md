# index-custom-source

Bring an unsupported source into Glean with the Indexing API — documents, permissions, and people — and see it live in search. It ships its own `sample-data/` fixtures, so the recipe is self-contained: nothing needs seeding first, and no other recipe has to run before it.

## Run it

```bash
export GLEAN_INDEXING_API_TOKEN=...
export GLEAN_SERVER_URL=...
export GLEAN_BETA_USER_EMAILS=you@yourcompany.com
uv run seed.py       # registers the sample_catalog test datasource, indexes documents + identities + employee profiles, allow-lists you as a viewer
uv run teardown.py   # deletes everything seed.py created (see caveat below)
```

## Safe against a real instance

The fixtures are invented, so indexing them into the instance your colleagues
search would put a made-up PTO policy next to the real one. `connector.py`
therefore registers `sample_catalog` as a **test datasource**
(`is_test_datasource=True`), which does two things: Glean turns off all ranking
signals from it, and it stays invisible to everyone — including you — until
specific emails are allow-listed.

`seed.py` makes that second call for you with `GLEAN_BETA_USER_EMAILS`, and
refuses to start if it's unset, since indexing first and discovering the problem
afterwards leaves content in the instance you can't see and didn't mean to
leave. Set `SAMPLE_CATALOG_PRODUCTION=1` once you've swapped the fixtures for a
real source and want a normal, everyone-visible datasource.

Dependencies are declared inline ([PEP 723](https://peps.python.org/pep-0723/)) and locked,
so [uv](https://docs.astral.sh/uv/) installs them into an isolated environment on first run —
no `requirements.txt`, virtualenv, or activate step. Re-run `uv lock --script <script>` after
editing the inline dependencies.

## What this does

`connector.py` defines two connectors against `glean-indexing-sdk==1.0.0b2`:

- **`SampleCatalogConnector`** (`BaseDatasourceConnector`) — reads every JSON file in `sample-data/documents/`, transforms each into a `DocumentDefinition` with a `DocumentPermissionsDefinition` built from that document's `permission` block (`allowed_groups` or `allowed_users`), and pushes the permission identities (`sample-data/people/*.json`) needed to evaluate those ACLs.
- **`SampleCatalogPeopleConnector`** (`BasePeopleConnector`) — indexes the same cast as searchable employee profiles, a separate Glean capability from document permissions.

**Never allow-all.** Every document carries a real permission block — general company docs are `Sample-All-Employees`, a few (compensation bands, HR case notes, one person's onboarding checklist) are restricted, so the permissions story is demonstrable, not just claimed.

**Teardown caveat:** there is no datasource-level delete anywhere in the Indexing API — this isn't a gap in the pinned SDK, the endpoint doesn't exist. `teardown.py` deletes every document, group, permission-user, and employee profile the seed created, but the `sample_catalog` datasource _registration_ itself is left in place. That leftover is a test datasource with no ranking impact and no viewers beyond whoever you allow-listed, and `seed.py` re-populates it cleanly on the next run; remove the entity itself from the Glean admin console if you want it gone. A single-page `documents.bulk_index` with an empty `documents` list is the other documented way to clear the content in one call — bulk endpoints replace rather than append, which is exactly what `disable_stale_document_deletion_check` guards against.

## Verify

Search "Who owns the payments-service catalog entry?" as yourself, then act as one of the sample users who is only in the Engineering fixture group — they should see it. Search for something in `hr-compensation-bands` as that same user; it should return nothing, since that document is restricted to the HR fixture group.

Getting no results at all for either query usually means the searching identity isn't on the beta-user allow-list — a test datasource is invisible to anyone who isn't, which looks identical to a failed index.
