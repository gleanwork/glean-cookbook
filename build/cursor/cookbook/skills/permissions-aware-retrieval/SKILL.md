---
name: permissions-aware-retrieval
description: "Use Glean's Platform API as the retrieval layer for your own LLM app — every result ACL-filtered for the caller before it ever reaches the model."
disable-model-invocation: true
---

Build "Ground your own LLM app in Glean" following https://developers.glean.com/cookbook/permissions-aware-retrieval

1. **Pick a language**
   Both variants implement the same flow — pick whichever fits your app's stack.

### Python

Platform API search.query → snippets → LLM with citations

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-retrieval/python permissions-aware-retrieval
   ```

2. **Set credentials**
   Fill in GLEAN_API_TOKEN, GLEAN_INSTANCE, and ANTHROPIC_API_KEY, then export them into your shell — unlike the TypeScript variant, this one reads the environment directly and does not load .env automatically.

   ```bash
   cp .env.example .env
   ```

3. **Run it**
   Dependencies are declared inline in main.py (PEP 723), so uv resolves and installs them into an isolated environment on first run — there's no requirements.txt, venv, or activate step.

   ```bash
   cd permissions-aware-retrieval && uv run main.py "What's our PTO policy?"
   ```

4. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Then ask for something another team owns: retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

### TypeScript

Same flow in TypeScript

1. **Scaffold the project**

   ```bash
   npx tiged --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-retrieval/typescript permissions-aware-retrieval
   ```

2. **Install dependencies**

   ```bash
   cd permissions-aware-retrieval && npm install
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
   Confirm the printed answer carries numbered citations with real titles and URLs. Then ask for something another team owns: retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

## Reference

Use Platform Search glean.search.query with query, page_size, and X_GLEAN_INCLUDE_EXPERIMENTAL=true. Results expose title, url, and snippets as strings. The caller's OAuth credential is the permission boundary; send no impersonation header. Pass only retrieved, ACL-filtered content to the model, include source links, and refuse to answer when retrieval is empty.

## Authentication

Use the first available credential path:

1. **Glean OAuth:** ask for the user's work email and run:
   ```bash
   node <plugin-root>/scripts/resolve-backend.mjs <work-email>
   ```
   If `oauthAvailable` is true, register a public client through the returned backend's Dynamic
   Client Registration endpoint and use authorization code + PKCE. Reuse the client id and refresh
   token.
2. **External IdP OAuth:** if Glean OAuth is unavailable, ask whether the user's administrator has
   configured Okta, Azure AD, Google, or another IdP for Glean Client API access. Use that sign-in
   flow when available.
3. **Glean API token:** otherwise request a token carrying the scopes declared by the recipe.

Do not use client credentials for an end-user Client API integration. Keep access and refresh tokens
server-side.

## Language

Ask me which language to build in before starting: Python, TypeScript.

## Verify

Do not report this recipe as done until you have run it for real (against a live Glean instance,
with real credentials) and confirmed every query below produces its expected behavior. A build
that runs without errors but fails one of these checks is not done — fix it and re-run before
reporting success.

- **Query:** "What's our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "Ask for something you personally don't have access to (another team's compensation review, an HR case file)"
  **Expected:** Retrieval returns nothing, so the app must say it has no information rather than answering from the model's own knowledge. This is the property that matters: your credential is the permission boundary, and an empty retrieval must produce a refusal, not a confident fabrication.
