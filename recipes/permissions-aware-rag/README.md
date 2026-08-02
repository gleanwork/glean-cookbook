# permissions-aware-rag

Use Glean's Platform API (the data-first retrieval surface, not the older Client API) as the retrieval layer for your own LLM app — every result is ACL-filtered per user before it ever reaches the model. The enterprise differentiator: no vector DB, no ACL mirroring, no re-sync.

- **[`python/`](python/)**
- **[`typescript/`](typescript/)**

Both variants: retrieve via `glean.search.query()` (the top-level method — not `glean.client.search.query()`, a different, older surface), extract `title`/`url`/`snippets` (a plain `string[]` in this API — no `.text` unwrap needed), send only those sources to an LLM (Claude here, swappable) with required inline `[n]` citations. Neither takes an impersonation flag, because neither needs one: your own credential is the permission boundary, so results arrive already filtered. Demonstrate it by asking for something another team owns — retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

**The Platform API is Experimental** (launched 2026-07, not yet GA) — every call must opt in with `X_GLEAN_INCLUDE_EXPERIMENTAL=true`, which both variants below set up for you via `.env`. Verified with a real HTTP round-trip against a local echo server (headers, body, and response parsing all confirmed) before shipping this recipe — no live Glean instance was available to test against, so that final check is still on you.

## Why there is no impersonation flag

Your credential is the permission boundary, so per-user filtering needs no code
and no headers. With a token from the Glean Authorization Server, send neither
`X-Glean-Auth-Type` nor `X-Glean-ActAs`.

`X-Glean-ActAs` exists for a different architecture — one service credential
impersonating users request by request — and applies to **global tokens only**.
An earlier version of this recipe was built around it, which forced readers to
obtain a global/admin token to run a demo that needs nothing of the sort. Note
the spelling if you ever do need it: `X-Glean-ActAs`, not the plausible-looking
`X-Glean-Act-As`, which a global token rejects with
`400 Required header missing: X-Glean-ActAs`.
