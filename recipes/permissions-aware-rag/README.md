# permissions-aware-rag

Use Glean's Platform API (the data-first retrieval surface, not the older Client API) as the retrieval layer for your own LLM app — every result is ACL-filtered per user before it ever reaches the model. The enterprise differentiator: no vector DB, no ACL mirroring, no re-sync.

- **[`python/`](python/)**
- **[`typescript/`](typescript/)**

Both variants: retrieve via `glean.search.query()` (the top-level method — not `glean.client.search.query()`, a different, older surface), extract `title`/`url`/`snippets` (a plain `string[]` in this API — no `.text` unwrap needed), send only those sources to an LLM (Claude here, swappable) with required inline `[n]` citations. Both support `--act-as <email>` to demonstrate the permissions boundary against your own instance — a global/admin Glean token impersonating a restricted user gets nothing back for documents outside their ACLs. Pick any document your instance restricts and a user who can't see it.

**The Platform API is Experimental** (launched 2026-07, not yet GA) — every call must opt in with `X_GLEAN_INCLUDE_EXPERIMENTAL=true`, which both variants below set up for you via `.env`. Verified with a real HTTP round-trip against a local echo server (headers, body, and response parsing all confirmed) before shipping this recipe — no live Glean instance was available to test against, so that final check is still on you.

## The act-as trap

`X-Glean-Act-As` needs a **global/admin** token. With an ordinary user token it is
not rejected — it is silently ignored, and every request comes back with the
token owner's own results. Verified against a live instance: a header of
`this is not an email at all` returned byte-identical results to sending no
header at all.

An app built on that looks per-user while serving one person's documents to
everyone who asks, which is precisely the failure this recipe exists to
demonstrate against. It cannot be detected from a single call, so `main.py`
preflights whenever `--act-as` is used: it searches as an identity that cannot
exist, and stops if that identity can see anything. Keep that check if you adapt
this code.
