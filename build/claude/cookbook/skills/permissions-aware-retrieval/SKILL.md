---
name: permissions-aware-retrieval
description: "Use Glean's Platform API as the retrieval layer for your own LLM app — every result ACL-filtered for the caller before it ever reaches the model."
disable-model-invocation: true
---

## Before you start

- A work email for tenant discovery and OAuth sign-in; a SEARCH-scoped API token is the fallback
- X_GLEAN_INCLUDE_EXPERIMENTAL=true set (the Platform API is Experimental as of its 2026-07 launch)
- An LLM API key (any provider; example uses Claude)
- uv (for the Python path) or Node 20+

Build "Ground your own LLM app in Glean" following https://developers.glean.com/cookbook/permissions-aware-retrieval

1. **Pick a language**
   Both variants implement the same flow — pick whichever fits your app's stack.

Ask which variant to build first, on its own, and wait for the answer. Then follow only that variant
below, asking its questions one at a time.

### Python

Platform API search.query → snippets → LLM with citations

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What topic can you access and expect Glean to answer?
- What topic should your account not be able to access?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-retrieval/python permissions-aware-retrieval
   ```

2. **Set credentials**
   Use the shipped login flow. Then have the user enter ANTHROPIC_API_KEY in ignored .env without exposing it in chat or command output.

   ```bash
   cd permissions-aware-retrieval && node scripts/glean-auth.mjs login --scopes search --email "<work-email>"
   ```

3. **Run it**
   Dependencies are declared inline in main.py (PEP 723), so uv resolves and installs them into an isolated environment on first run — there's no requirements.txt, venv, or activate step.

   ```bash
   cd permissions-aware-retrieval && uv run main.py "<allowed-topic>"
   ```

   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.

4. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Then ask for something another team owns: retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

### TypeScript

Same flow in TypeScript

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What topic can you access and expect Glean to answer?
- What topic should your account not be able to access?

Use the scaffold's shipped login command. Never implement or modify OAuth during setup.

1. **Scaffold the project**

   ```bash
   npx -y tiged@2.12.8 --mode=git gleanwork/glean-cookbook/recipes/permissions-aware-retrieval/typescript permissions-aware-retrieval
   ```

2. **Install dependencies**

   ```bash
   cd permissions-aware-retrieval && npm install
   ```

3. **Set credentials**
   Use the shipped login flow. Then have the user enter ANTHROPIC_API_KEY in ignored .env without exposing it in chat or command output.

   ```bash
   cd permissions-aware-retrieval && npm run login -- --email "<work-email>"
   ```

4. **Run it**

   ```bash
   cd permissions-aware-retrieval && npm start -- "<allowed-topic>"
   ```

   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.

5. **Verify**
   Confirm the printed answer carries numbered citations with real titles and URLs. Then ask for something another team owns: retrieval returns nothing and the app must say so rather than answering from the model's own knowledge.

## Language

Ask me which language to build in before starting: Python, TypeScript.
