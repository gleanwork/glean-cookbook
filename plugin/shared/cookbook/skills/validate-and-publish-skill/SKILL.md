---
name: validate-and-publish-skill
description: 'Validate a local SKILL.md, create a skill in Glean, confirm the downloaded file matches your upload, and delete the test skill using the official TypeScript API client.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- Permission to create and delete test skills, using OAuth or a user-scoped token with the SKILLS scope.

Build "Validate and publish a skill" following https://developers.glean.com/cookbook/validate-and-publish-skill

{{> ask-setup-questions}}

- What is your work email address?

{{> oauth-setup}}

1. **Copy the project onto your machine**
   Copy the runnable TypeScript Skills CLI, sample SKILL.md, and credential-free fixture tests into a new directory. OAuth login and secure token storage come from the pinned @gleanwork/auth package.

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill
   ```

2. **Install dependencies**
   Enter the project directory and install its dependencies. Run the remaining commands from this directory.

   ```bash
   cd validate-and-publish-skill && npm install
   ```

3. **Run the fixture tests**
   Run the tests without real credentials or network access. Workflow tests use the real SDK with MSW HTTP handlers to check content comparison and failure handling. Unhandled requests fail. CLI smoke tests cover help and local argument handling. Passing these tests does not verify access to your Glean instance.

   ```bash
   npm test
   ```

4. **Sign in with OAuth**
   Sign in to your Glean instance with the SKILLS scope. The official authentication library handles login and secure credential storage. If OAuth is not available, skip this command: copy .env.example to .env and fill GLEAN_API_TOKEN and GLEAN_SERVER_URL.

   ```bash
   npm run login -- --email "<work-email>"
   ```

5. **Choose how to connect to your instance**
   The commands below use OAuth and your work email. With token authentication, omit --email and use GLEAN_SERVER_URL from .env. If email discovery finds the wrong instance, replace --email with --server-url and your complete backend HTTPS origin. If your administrator supplies an OAuth client ID, export GLEAN_OAUTH_CLIENT_ID before login; login does not read .env.

6. **Verify against your instance**
   Create a uniquely named test skill, retrieve it, compare the downloaded SKILL.md byte for byte with the upload, and permanently delete it. A mismatch fails verification but still triggers cleanup. Success prints a Verified line ending with cleanup completed. With token authentication, run npm run verify instead of the OAuth command below. Files are not extracted to disk or executed.

   ```bash
   npm run verify -- --email "<work-email>"
   ```

7. **Test your own SKILL.md**
   The command uses the included sample file. Add --bundle with a path to test your own SKILL.md. Choose an unused name and do not publish that name concurrently. This command also deletes the test skill afterward; it does not leave a published skill for you to use. With token authentication, run npm start -- --yes instead.
   ```bash
   npm start -- --email "<work-email>" --yes
   ```
   {{> run-cli}}
