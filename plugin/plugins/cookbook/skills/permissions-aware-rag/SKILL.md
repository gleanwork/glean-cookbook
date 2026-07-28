---
name: permissions-aware-rag
description: "Use Glean's Platform API as the retrieval layer for your own LLM app — every chunk ACL-filtered per user before it ever reaches the model."
disable-model-invocation: true
---

Build permissions-aware RAG on Glean following
https://developers.glean.com/cookbook/permissions-aware-rag

1. Retrieval: glean.search.query(query=..., page_size=8) — the
   top-level Platform API method, NOT glean.client.search.query(),
   which is a different, older surface (the Client API). The Platform
   API is Experimental as of its 2026-07 launch: set
   X_GLEAN_INCLUDE_EXPERIMENTAL=true as an env var or every call fails
   — there's no argument for this on search.query() itself. Collect
   title, url, and snippets from each result — snippets is a plain
   string[] here (no .text unwrap needed, unlike the Client API).
2. Prompt the LLM with ONLY those snippets; require inline [n] citations
   mapped back to the result URLs.
3. Enforce per-user: pass an X-Glean-Act-As: <email> HTTP header (not a
   query parameter or SDK option) to impersonate a specific user with a
   global/admin token. Demo with two users where the restricted one
   gets "I don't have information on that" for HR-only queries.
4. README must state the differentiator: no vector DB, no ACL
   mirroring, no re-sync — Glean is the governed retrieval layer.

Use claude-sonnet-5 via the anthropic SDK if I don't specify a
provider; keep the LLM call swappable.

## Reference

Platform API search (data-first retrieval, distinct from the Client API's glean.client.search.query): glean.search.query(query, page_size, http_headers) -> PlatformSearchResponse. Result shape: results[].title, results[].url, results[].snippets (string[], not snippet objects). Experimental since its 2026-07-14 public launch — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true (env var, read automatically by the SDK) on every call or it 4xxs. Per-user enforcement is still the X-Glean-Act-As HTTP header on a global/admin token, not an SDK parameter, same as the Client API.

## Authentication

This recipe needs `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## Language

Ask me which language to build in before starting: Python, TypeScript.
