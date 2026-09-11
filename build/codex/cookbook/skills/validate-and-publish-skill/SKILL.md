---
name: validate-and-publish-skill
description: 'Use the official TypeScript API client to validate a local SKILL.md, persist it once to your Glean instance, confirm list, get, and latest content, then delete only the skill ID this run created.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that permits the native skills:read and skills:write OAuth scopes; the legacy SKILLS compatibility scope or a user-scoped token is the fallback
- A local SKILL.md; the scaffold includes a non-executable sample at fixtures/sample-skill/SKILL.md, and npm start uses that path by default

Build "Validate and publish a skill" following https://developers.glean.com/cookbook/validate-and-publish-skill

Use nonsecret inputs the user already supplied. Ask only for missing information needed by the
selected recipe path, resolving dependent choices before continuing. Do not request credential
values in conversation; use the recipe's documented secure sign-in or secret-entry path. Required
questions for this recipe are:

- What is your work email address?

Follow the selected authentication path. If OAuth is selected, run the recipe's shipped login
command with its declared scopes. If the documented token path is selected, skip OAuth login
and use that path's declared secure configuration. Keep sign-in and secret entry user-controlled.
Do not implement or alter OAuth while setting up the recipe, and do not silently substitute a
path when the documented one fails.

1. **Copy the project onto your machine**
   Copy the runnable TypeScript Skills CLI, sample SKILL.md, and credential-free fixture tests into a new directory. OAuth login and secure token storage come from the pinned @gleanwork/auth package.

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill
   ```

2. **Install dependencies**

   ```bash
   cd validate-and-publish-skill && npm install
   ```

3. **Run the fixture tests**
   Run the Vitest fixture suite without credentials or network access, covering validation-before-create, a single persist, list/get, latest content download, and captured-ID cleanup.

   ```bash
   cd validate-and-publish-skill && npm test
   ```

4. **Sign in with OAuth**
   Discover your Glean backend from work email and request skills:read and skills:write. Only a recognized scope-grant failure triggers one retry with legacy SKILLS. If OAuth is not available, skip this command: copy .env.example to .env and fill GLEAN_API_TOKEN and GLEAN_SERVER_URL.

   ```bash
   cd validate-and-publish-skill && npm run login -- --email "<work-email>"
   ```

5. **Pass an explicit backend if you need one**
   If email discovery is wrong, pass --server-url with the complete Glean backend HTTPS origin on login, verify, and start. If DCR is restricted, export GLEAN_OAUTH_CLIENT_ID in your shell before npm run login. npm run login does not read .env, so do not store that client id only in .env.

6. **Verify against your instance**
   Validate a cryptographically unique SKILL.md, persist it once, confirm list/get/latest content, then permanently delete only the ID returned by this run. Success prints a Verified line that ends with cleanup completed.

   ```bash
   cd validate-and-publish-skill && npm run verify -- --email "<work-email>"
   ```

7. **Persist your local SKILL.md**
   Validate fixtures/sample-skill/SKILL.md, persist it once, then delete only that captured ID. Pass --bundle with your own SKILL.md to use a different file. This run still deletes the skill it creates; pass --yes when the terminal is not interactive.
   ```bash
   cd validate-and-publish-skill && npm start -- --email "<work-email>" --yes
   ```
   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.
