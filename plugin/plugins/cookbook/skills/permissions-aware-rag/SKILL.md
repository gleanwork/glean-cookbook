---
name: permissions-aware-rag
description: "Use Glean's Platform API as the retrieval layer for your own LLM app — every chunk ACL-filtered per user before it ever reaches the model."
disable-model-invocation: true
---

Build "Permissions-aware RAG" following https://developers.glean.com/cookbook/permissions-aware-rag

1. **Pick a language**
   Both variants implement the same flow — pick whichever fits your app's stack.

### Python

Platform API search.query → snippets → LLM with citations

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-rag/python permissions-aware-rag
   ```

2. **Install dependencies**

   ```bash
   cd permissions-aware-rag && pip install -r requirements.txt
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and ANTHROPIC_API_KEY, then export them into your shell — unlike the TypeScript variant, this one reads the environment directly and does not load .env automatically.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   python main.py "What's our PTO policy?"
   ```

5. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Re-run with --act-as <restricted-user-email> (requires a global/admin token) and confirm an HR-only query returns no fabricated answer for that user.

### TypeScript

Same flow in TypeScript

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-rag/typescript permissions-aware-rag
   ```

2. **Install dependencies**

   ```bash
   cd permissions-aware-rag && npm install
   ```

3. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and ANTHROPIC_API_KEY — loaded automatically via dotenv in this variant.

   ```bash
   cp .env.example .env
   ```

4. **Run it**

   ```bash
   npm start -- "What's our PTO policy?"
   ```

5. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Re-run with -- "<question>" --act-as <restricted-user-email> (requires a global/admin token) and confirm an HR-only query returns no fabricated answer for that user.

## Reference

Platform API search (data-first retrieval, distinct from the Client API's glean.client.search.query): glean.search.query(query, page_size, http_headers) -> PlatformSearchResponse. Result shape: results[].title, results[].url, results[].snippets (string[], not snippet objects). Experimental since its 2026-07-14 public launch — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true (env var, read automatically by the SDK) on every call or it 4xxs. Per-user enforcement is still the X-Glean-Act-As HTTP header on a global/admin token, not an SDK parameter, same as the Client API.

## Authentication

This recipe needs `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## Language

Ask me which language to build in before starting: Python, TypeScript.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance, with real credentials) and confirmed every query below produces its expected behavior. A build that runs without errors but fails one of these checks is not done — fix it and re-run before reporting success.

- **Query:** "What's our PTO policy?"
  **Expected:** Any user gets a cited answer — this doc is broadly readable, so permissions don't restrict it.
- **Query:** "What are the engineering compensation bands?"
  **Expected:** A user with access to the compensation-bands doc gets a cited answer; a user without that access gets no citation for it and the LLM must not fabricate an answer from the missing context. search.query has to respect the caller's real Glean permissions for both cases — that's the actual thing this recipe verifies.
