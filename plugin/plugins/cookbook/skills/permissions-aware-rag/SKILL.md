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

2. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and ANTHROPIC_API_KEY, then export them into your shell — unlike the TypeScript variant, this one reads the environment directly and does not load .env automatically.

   ```bash
   cp .env.example .env
   ```

3. **Run it**
   Dependencies are declared inline in main.py (PEP 723), so uv resolves and installs them into an isolated environment on first run — there's no requirements.txt, venv, or activate step.

   ```bash
   cd permissions-aware-rag && uv run main.py "What's our PTO policy?"
   ```

4. **Verify**
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

Platform API search (data-first retrieval, distinct from the Client API's glean.client.search.query): glean.search.query(query, page_size, http_headers) -> PlatformSearchResponse. Result shape: results[].title, results[].url, results[].snippets (string[], not snippet objects). Experimental since its 2026-07-14 public launch — requires X_GLEAN_INCLUDE_EXPERIMENTAL=true (env var, read automatically by the SDK) on every call or it 4xxs. Per-user enforcement is still the X-Glean-ActAs HTTP header on a global/admin token, not an SDK parameter, same as the Client API. Per-user filtering needs no headers: with a token from the Glean Authorization Server the caller's own credential is the permission boundary. Do not add X-Glean-ActAs -- that is for a service architecture holding one global token, it applies to global tokens only, and it is spelled X-Glean-ActAs rather than the plausible-looking X-Glean-Act-As (Glean's own Web SDK bundle and every doc occurrence use the former; a global token sent the latter fails with 400 Required header missing). X-Glean-Auth-Type: OAUTH is likewise only needed for external-IdP tokens. The verifiable claim for this recipe is that an empty retrieval produces a refusal rather than a fabricated answer.

## Authentication

{{> auth-client-api}}

## Language

Ask me which language to build in before starting: Python, TypeScript.

## Verify

{{> verify-gate}}

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Ask for something you personally don't have access to (another team's compensation review, an HR case file)"
  **Expected:** Retrieval returns nothing, so the app must say it has no information rather than answering from the model's own knowledge. This is the property that matters: your credential is the permission boundary, and an empty retrieval must produce a refusal, not a confident fabrication.
