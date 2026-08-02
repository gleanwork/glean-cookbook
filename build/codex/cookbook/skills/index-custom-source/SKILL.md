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

2. **Set credentials**
   Export GLEAN_INDEXING_API_TOKEN and GLEAN_SERVER_URL — this recipe has no .env.example, it reads directly from the environment (see the Authentication section below).

3. **Run it**
   Dependencies are declared inline (PEP 723) and locked, so uv installs them into an isolated environment on first run — no requirements.txt, venv, or activate step.

   ```bash
   cd index-custom-source && uv run seed.py
   ```

4. **Verify**
   Search "Who owns the payments-service catalog entry?" as yourself and as a restricted test user — the restricted user must not see the HR-restricted fixtures.

## Setup

- Scaffold connector

## Reference

glean-indexing-sdk==1.0.0b2. BaseDatasourceConnector subclass sets `configuration: CustomDatasourceConfig` and implements transform() -> Sequence[DocumentDefinition]; permissions via DocumentPermissionsDefinition(allowed_groups=[...] | allowed_users=[UserReferenceDefinition(email=...)]). get_identities() returns DatasourceIdentityDefinitions(users, groups, memberships) for ACL evaluation. DocumentDefinition.created_at/updated_at are epoch seconds (int), not ISO strings. No datasources.delete() exists in this SDK version.

## Authentication

Indexing API operations accept Glean-issued tokens only — OAuth does not apply here regardless of
tenant configuration (per developers.glean.com/api-info/client/authentication/oauth). Don't run an
OAuth detection chain for an indexing recipe; go straight to asking for a Glean
Indexing API token (`GLEAN_INDEXING_API_TOKEN`) and server URL (`GLEAN_SERVER_URL`), the same way
`index-custom-source` already does.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "Who owns the payments-service catalog entry?"
  **Expected:** After indexing, search surfaces the connector-indexed catalog document as a citation. This query targets the recipe's own sample-data, which is the one corpus you do control.
- **Query:** "What's the on-call runbook for checkout-service?"
  **Expected:** Search surfaces the connector-indexed checkout-service runbook, proving the connector's own documents (not just natively indexed ones) are searchable and permission-scoped.
