# permissions-aware-rag

Use Glean's Platform API (the data-first retrieval surface, not the older Client API) as the retrieval layer for your own LLM app — every result is ACL-filtered per user before it ever reaches the model. The enterprise differentiator: no vector DB, no ACL mirroring, no re-sync.

- **[`python/`](python/)**
- **[`typescript/`](typescript/)**

Both variants: retrieve via `glean.search.query()` (the top-level method — not `glean.client.search.query()`, a different, older surface), extract `title`/`url`/`snippets` (a plain `string[]` in this API — no `.text` unwrap needed), send only those sources to an LLM (Claude here, swappable) with required inline `[n]` citations. Both support `--act-as <email>` to demonstrate the permissions boundary against the [acme-corpus](../../acme-corpus/) dataset — a global/admin Glean token impersonating a restricted user gets nothing back for documents outside their ACLs.

**The Platform API is Experimental** (launched 2026-07, not yet GA) — every call must opt in with `X_GLEAN_INCLUDE_EXPERIMENTAL=true`, which both variants below set up for you via `.env`. Verified with a real HTTP round-trip against a local echo server (headers, body, and response parsing all confirmed) before shipping this recipe — no live Glean instance was available to test against, so that final check is still on you.
