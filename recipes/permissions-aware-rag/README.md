# permissions-aware-rag

Use Glean Search as the retrieval layer for your own LLM app — every result is ACL-filtered per user before it ever reaches the model. The enterprise differentiator: no vector DB, no ACL mirroring, no re-sync.

- **[`python/`](python/)**
- **[`typescript/`](typescript/)**

Both variants: retrieve via `glean.client.search.query()`, extract `title`/`url`/`snippets[].text`, send only those sources to an LLM (Claude here, swappable) with required inline `[n]` citations. Both support `--act-as <email>` to demonstrate the permissions boundary against the [acme-corpus](../../acme-corpus/) dataset — a global/admin Glean token impersonating a restricted user gets nothing back for documents outside their ACLs.
