# permissions-aware-retrieval

Use Glean's Platform API (the data-first retrieval surface, not the older Client API) as the retrieval layer for your own LLM app — every result is ACL-filtered per user before it ever reaches the model. The enterprise differentiator: no vector DB, no ACL mirroring, no re-sync.

- **[`python/`](python/)**
- **[`typescript/`](typescript/)**

Both variants: retrieve via `glean.search.query()` (the top-level method — not `glean.client.search.query()`, a different, older surface), extract `title`/`url`/`snippets` (a plain `string[]` in this API — no `.text` unwrap needed), send only those sources to an LLM (Claude here, swappable) with required inline `[n]` citations. Neither takes an impersonation flag, because neither needs one: your own credential is the permission boundary, so results arrive already filtered. Demonstrate it by asking for something another team owns — retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

**The Platform API is Experimental** — every call must opt in with `X_GLEAN_INCLUDE_EXPERIMENTAL=true`, which both variants set through `.env`. Verify the final retrieval and permission behavior against your own Glean instance.

## Why there is no impersonation flag

Your own credential is the permission boundary, so results are filtered to what
you can access. Do not use a global credential or send impersonation headers.
