---
name: skill-publishing-pipeline
description: 'After a first persist, prove name-based version supersession, retrieve a specific version, stage downloaded bytes in a bounded zip sandbox, and delete only the run-owned skill.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- A tenant that permits the native skills:read and skills:write OAuth scopes; the legacy SKILLS compatibility scope or a user-scoped token is the fallback
- The scaffold includes a sample SKILL.md at fixtures/sample-skill/SKILL.md; the later publish step can use that sample or your own bundle

Build "Publish a versioned skill bundle" following https://developers.glean.com/cookbook/skill-publishing-pipeline

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
   Copy the Skills versioning CLI, sample bundle, CI example, and credential-free fixture tests into a new directory. OAuth login and secure token storage come from the pinned @gleanwork/auth package.

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/skill-publishing-pipeline skill-publishing-pipeline
   ```

2. **Install dependencies**

   ```bash
   cd skill-publishing-pipeline && npm install
   ```

3. **Run the fixture tests**
   Run name-based supersession, version retrieval, scope fallback classification, and adversarial archive tests without credentials or network access.

   ```bash
   cd skill-publishing-pipeline && npm test
   ```

4. **Sign in with OAuth**
   Discover your Glean backend from work email and request skills:read and skills:write. Only a recognized scope-grant failure triggers one retry with legacy SKILLS. If OAuth is not available, skip this command: copy .env.example to .env and fill GLEAN_API_TOKEN and GLEAN_SERVER_URL.

   ```bash
   cd skill-publishing-pipeline && npm run login -- --email "<work-email>"
   ```

5. **Pass an explicit backend if you need one**
   If email discovery is wrong, pass --server-url with the complete Glean backend HTTPS origin on login, verify, and start. If DCR is restricted, export GLEAN_OAUTH_CLIENT_ID in your shell before npm run login. npm run login does not read .env, so do not store that client id only in .env.

6. **Verify versioning on your instance**
   Create a cryptographically unique sample, publish a second version under the same name, retrieve and stage that version's content in a bounded sandbox, then permanently delete only the ID returned by this run. Success prints a Verified line that ends with cleanup completed.

   ```bash
   cd skill-publishing-pipeline && npm run verify -- --email "<work-email>"
   ```

7. **Publish a new version of your bundle**
   Validate fixtures/sample-skill/SKILL.md by default, confirm before name-based supersession if that display name already exists, and stage the returned zip under staged/ID/vVERSION.MINOR so a second publish does not overwrite the first. Pass --bundle with your own SKILL.md, .zip, or .skill, and --stage-dir to choose a different parent folder. The command prints the exact ID before staging, which you need for optional cleanup.

   ```bash
   cd skill-publishing-pipeline && npm start -- publish --email "<work-email>"
   ```

   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.

8. **Push this directory as a GitHub repository**
   Treat this scaffold directory as the GitHub repository root. The workflow at .github/workflows/publish-skill.yml is already in the scaffold and already points at fixtures/sample-skill/SKILL.md. Push this directory, then set a user-scoped token secret and backend-origin variable in that repository.

9. **Delete the published skill only when you intend to**
   Deletion permanently removes every version. Pass only the exact ID printed by your publish run and read the confirmation prompt.
   ```bash
   cd skill-publishing-pipeline && npm start -- cleanup --id "PASTE_THE_ID_PRINTED_BY_PUBLISH" --email "<work-email>"
   ```
