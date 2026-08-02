# permissions-aware-rag / typescript

Same flow as [`../python/`](../python/): Glean Search as the retrieval layer for your own LLM app, every result already ACL-filtered per user. No vector DB, no ACL mirroring, no re-sync.

## Run it

```bash
npm install
cp .env.example .env   # fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, ANTHROPIC_API_KEY
npm start -- "What's our PTO policy?"
```

## The permissions demo

With a **global/admin** Glean token, impersonate a specific user via `--act-as` to prove retrieval is scoped to _their_ permissions, not the token's:

```bash
npm start -- "<a question only one team should be able to answer>" --act-as <user-without-access@yourcompany.com>
# -> "I don't have information on that." — outside their ACLs, so nothing is retrieved

npm start -- "<a question only one team should be able to answer>" --act-as <user-with-access@yourcompany.com>
# -> answers, cited — the document is within their ACLs
```

## What this does

1. **Retrieve**: `glean.client.search.query({ query, pageSize: 8 }, undefined, { headers: { 'X-Glean-Act-As': actAs } })` — the same Client API endpoint used everywhere else in this cookbook.
2. **Extract**: `results[].title`, `results[].url`, `results[].snippets[].text` become numbered sources.
3. **Answer**: the sources — and only the sources — go to Claude (`claude-sonnet-5` here; swap the `Anthropic` client for any provider) with a prompt requiring inline `[n]` citations.

Verified against the actually installed `@gleanwork/api-client@0.18.0` and `@anthropic-ai/sdk@0.115.0` — typechecks clean, and a runtime smoke test confirms it reaches the real SDK call path.
