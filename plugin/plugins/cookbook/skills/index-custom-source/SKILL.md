---
name: index-custom-source
description: 'Bring an unsupported source into Glean with the Indexing API — documents, permissions, and people — and see it live in search. This recipe seeds the Acme corpus every other recipe searches.'
disable-model-invocation: true
---

Build "Index a custom data source" following https://developers.glean.com/cookbook/index-custom-source

1. **Scaffold the project**
   connector.py resolves the corpus via a relative path two levels up (Path(**file**).parent.parent.parent / "acme-corpus") — scaffold both directories preserving that same nesting, not flattened into one directory.

   ```bash
   mkdir -p index-custom-source/recipes/index-custom-source index-custom-source/acme-corpus
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/index-custom-source index-custom-source/recipes/index-custom-source
   npx tiged --mode=git gleanwork/glean-cookbook/acme-corpus index-custom-source/acme-corpus
   ```

2. **Install dependencies**

   ```bash
   cd index-custom-source/recipes/index-custom-source && pip install -r requirements.txt
   ```

3. **Set credentials**
   Export GLEAN_INDEXING_API_TOKEN and GLEAN_SERVER_URL — this recipe has no .env.example, it reads directly from the environment (see indexing-token in cookbook-conventions).

4. **Run it**
   Registers the custom datasource and bulk-indexes documents/people with real per-document permissions — never allow-all.

   ```bash
   python seed.py
   ```

5. **Verify**
   Search "Who owns the payments-service catalog entry?" as yourself and as a restricted test user — the restricted user must not see Acme-HR-only documents.

## Setup

- Scaffold connector

## Reference

glean-indexing-sdk==1.0.0b2. BaseDatasourceConnector subclass sets `configuration: CustomDatasourceConfig` and implements transform() -> Sequence[DocumentDefinition]; permissions via DocumentPermissionsDefinition(allowed_groups=[...] | allowed_users=[UserReferenceDefinition(email=...)]). get_identities() returns DatasourceIdentityDefinitions(users, groups, memberships) for ACL evaluation. DocumentDefinition.created_at/updated_at are epoch seconds (int), not ISO strings. No datasources.delete() exists in this SDK version.

## Authentication

This recipe needs `indexing-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance, with real credentials) and confirmed every query below produces its expected behavior. A build that runs without errors but fails one of these checks is not done — fix it and re-run before reporting success.

- **Query:** "Who owns the payments-service catalog entry?"
  **Expected:** After indexing, Glean search/chat surfaces the custom-connector-indexed catalog document as a citation, naming the real owner — proving the connector's documents (not just seeded native ones) are searchable and permissions-scoped.
- **Query:** "What's the on-call runbook for checkout-service?"
  **Expected:** Glean search/chat surfaces the custom-connector-indexed checkout-service runbook document as a citation.
