---
name: index-custom-source
description: 'Bring an unsupported source into Glean with the Indexing API — documents, permissions, and people — and see it live in search. Ships sample fixtures so it runs standalone; point it at your own source to make it real.'
disable-model-invocation: true
---

Build "Index a custom data source" following https://developers.glean.com/cookbook/index-custom-source

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/index-custom-source index-custom-source
   ```

2. **Set credentials and pick who can see it**
   Export GLEAN_INDEXING_API_TOKEN, GLEAN_SERVER_URL, and GLEAN_BETA_USER_EMAILS (usually just your own email) — this recipe has no .env.example, it reads directly from the environment (see the Authentication section below). The sample fixtures go into a test datasource, which is invisible to everyone until those emails are allow-listed, so seed.py refuses to start without it rather than uploading content you can't see.

3. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd index-custom-source && uv run seed.py
   ```

4. **Verify**
   Search "Who owns the payments-service catalog entry?" as yourself and as a restricted test user — the restricted user must not see the HR-restricted fixtures. Both users need to be on the beta-user allow-list to see the datasource at all.

## Setup

- Scaffold connector

## Reference

glean-indexing-sdk==1.0.0b2. BaseDatasourceConnector subclass sets `configuration: CustomDatasourceConfig` and implements transform() -> Sequence[DocumentDefinition]; permissions via DocumentPermissionsDefinition(allowed_groups=[...] | allowed_users=[UserReferenceDefinition(email=...)]). get_identities() returns DatasourceIdentityDefinitions(users, groups, memberships) for ACL evaluation. DocumentDefinition.created_at/updated_at are epoch seconds (int), not ISO strings. Sample fixtures are indexed with is_test_datasource=True: ranking signals off, and visible to nobody until glean.indexing.permissions.authorize_beta_users(datasource, emails) grants it — both halves are needed, since the field alone only disables ranking. There is no datasource-level delete anywhere in the Indexing API, not just missing from this SDK version: teardown is per-item deletes, or a single-page bulk_index with an empty documents list (bulk endpoints replace rather than append, which is what disable_stale_document_deletion_check guards).

## Authentication

{{> auth-indexing-token}}

## Verify

{{> verify-gate}}

- **Query:** "Who owns the payments-service catalog entry?"
  **Expected:** After indexing, search surfaces the connector-indexed catalog document as a citation. This query targets the recipe's own sample-data, which is the one corpus you do control.
- **Query:** "What's the on-call runbook for checkout-service?"
  **Expected:** Search surfaces the connector-indexed checkout-service runbook, proving the connector's own documents (not just natively indexed ones) are searchable and permission-scoped.
