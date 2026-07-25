---
name: index-custom-source
description: 'Bring an unsupported source into Glean with the Indexing API — documents, permissions, and people — and see it live in search. This recipe seeds the Acme corpus every other recipe searches.'
---

Index the Acme demo corpus into my Glean instance following
https://developers.glean.com/cookbook/index-custom-source

1. Ask me for my Indexing API token + server URL (env vars only:
   GLEAN_INDEXING_API_TOKEN, GLEAN_SERVER_URL).
2. Register the custom datasource per the recipe's CustomDatasourceConfig
   (glean-indexing-sdk==1.0.0b2, BaseDatasourceConnector.configure_datasource()).
3. Run the connector from recipes/index-custom-source: bulk-index documents
   WITH their permissions (DocumentPermissionsDefinition allowed_groups /
   allowed_users) — never allow-all. Push identities via get_identities()
   returning DatasourceIdentityDefinitions so ACLs actually evaluate.
4. Verify: search "Who owns the payments-service catalog entry?" as me and
   as a restricted test user; the restricted user must NOT see the
   Acme-HR-only documents.

Note: this SDK version has no datasources.delete() call — only per-item
deletes (documents, permission users/groups, employees). Don't invent a
full datasource-teardown API.

## Setup

- Scaffold connector

## Reference

glean-indexing-sdk==1.0.0b2. BaseDatasourceConnector subclass sets `configuration: CustomDatasourceConfig` and implements transform() -> Sequence[DocumentDefinition]; permissions via DocumentPermissionsDefinition(allowed_groups=[...] | allowed_users=[UserReferenceDefinition(email=...)]). get_identities() returns DatasourceIdentityDefinitions(users, groups, memberships) for ACL evaluation. DocumentDefinition.created_at/updated_at are epoch seconds (int), not ISO strings. No datasources.delete() exists in this SDK version.
