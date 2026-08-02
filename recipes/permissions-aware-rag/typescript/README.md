# permissions-aware-rag / typescript

Same flow as [`../python/`](../python/): Glean Search as the retrieval layer for your own LLM app, every result already ACL-filtered per user. No vector DB, no ACL mirroring, no re-sync.

## Run it

```bash
npm install
cp .env.example .env   # fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, ANTHROPIC_API_KEY
npm start -- "What's our PTO policy?"
```

## The permissions demo

There is nothing to configure. Your credential _is_ the permission boundary, so
every result is already filtered to what you can see:

```bash
npm start -- "<a question only another team should be able to answer>"
# -> "I don't have information on that." — outside your ACLs, so nothing was retrieved

npm start -- "What's our PTO policy?"
# -> answers, cited
```

That first case is the one worth dwelling on. Retrieval returning nothing is the
normal, correct outcome for a document you can't see — so the code that matters
is the refusal. An LLM handed no sources will happily answer from its own
training data, and a confident answer with no citations is precisely the failure
this architecture exists to prevent.

Per-user filtering needs no headers and no impersonation — your credential is
the boundary.

## What this does

1. **Retrieve**: `glean.search.query({ query, page_size: 8 })` — the top-level Platform API method, **not** `glean.client.search.query()`, which is a different, older surface. The Platform API is Experimental as of its 2026-07 launch, so `X_GLEAN_INCLUDE_EXPERIMENTAL=true` must be set in the environment or every call fails.
2. **Extract**: `results[].title`, `results[].url`, and `results[].snippets` — a plain `string[]` on this API, with no `.text` unwrap — become numbered sources.
3. **Answer**: the sources — and only the sources — go to Claude (`claude-sonnet-5` here; swap the `Anthropic` client for any provider) with a prompt requiring inline `[n]` citations.

Verified against the actually installed `@gleanwork/api-client@0.18.0` and `@anthropic-ai/sdk@0.115.0` — typechecks clean, and a runtime smoke test confirms it reaches the real SDK call path.
