# permissions-aware-rag / python

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

With a **global/admin** Glean token, impersonate a specific user via `--act-as` to prove retrieval is scoped to _their_ permissions, not the token's:

```bash
uv run main.py "What are the engineering compensation bands?" --act-as marcus.webb@acme.example.com
# -> "I don't have information on that." (Marcus is Acme-Engineering only, not Acme-HR)

uv run main.py "What are the engineering compensation bands?" --act-as dana.okafor@acme.example.com
# -> answers, cited (Dana is in Acme-HR)
```

This only works with a token that has permission to impersonate — a user-scoped token will search as that user regardless of `--act-as`.

## What this does

1. **Retrieve**: `glean.client.search.query(query=..., page_size=8, http_headers={"X-Glean-Act-As": act_as})` — the same Client API endpoint (`/rest/api/v1/search`) used everywhere else in this cookbook, not the newer top-level `glean.search.query()`, which is a separate data-retrieval API still in RFC as of this writing.
2. **Extract**: `results[].title`, `results[].url`, `results[].snippets[].text` become numbered sources.
3. **Answer**: the sources — and only the sources — go to Claude (`claude-sonnet-5` here; swap the `Anthropic` client for any provider) with a prompt requiring inline `[n]` citations.

Verified against the actually installed `glean-api-client==0.15.4` and `anthropic==0.120.0` — not guessed from docs.
