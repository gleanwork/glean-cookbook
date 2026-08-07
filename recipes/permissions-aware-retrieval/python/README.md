# permissions-aware-retrieval / python

Use Glean Search as the retrieval layer for your own LLM app — every result is already ACL-filtered per user before it ever reaches the model. No vector DB, no ACL mirroring, no re-sync: Glean is the governed retrieval layer.

## Run it

```bash
cp .env.example .env   # fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, ANTHROPIC_API_KEY
uv run main.py "What's our PTO policy?"
```

Dependencies are declared inline in `main.py` ([PEP 723](https://peps.python.org/pep-0723/)),
so [uv](https://docs.astral.sh/uv/) installs them into an isolated environment on first run —
no `requirements.txt`, no virtualenv, no activate step. `main.py.lock` pins the whole
transitive tree with hashes, so this runs the same today as it did when it was verified; add
`--locked` to fail rather than re-resolve if it ever drifts. After editing the inline
dependencies, re-run `uv lock --script main.py`.

Prefer pip? The direct pins are in that same block: `pip install glean-api-client==0.15.4
anthropic==0.120.0` inside a virtualenv you manage yourself — though you lose the transitive
pinning the lock gives you.

## The permissions demo

There is nothing to configure. Your credential _is_ the permission boundary, so
every result is already filtered to what you can see:

```bash
uv run main.py "<a question only another team should be able to answer>"
# -> "I don't have information on that." — outside your ACLs, so nothing was retrieved

uv run main.py "What's our PTO policy?"
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

1. **Retrieve**: `glean.search.query(query=..., page_size=8)` — the top-level Platform API method, **not** `glean.client.search.query()`, which is a different, older surface. The Platform API is Experimental as of its 2026-07 launch, so `X_GLEAN_INCLUDE_EXPERIMENTAL=true` must be set in the environment or every call fails.
2. **Extract**: `results[].title`, `results[].url`, and `results[].snippets` — a plain `string[]` on this API, with no `.text` unwrap — become numbered sources.
3. **Answer**: the sources — and only the sources — go to Claude (`claude-sonnet-5` here; swap the `Anthropic` client for any provider) with a prompt requiring inline `[n]` citations.

The example pins `glean-api-client==0.15.4` and `anthropic==0.120.0`.
