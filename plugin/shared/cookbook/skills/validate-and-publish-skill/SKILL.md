---
name: validate-and-publish-skill
description: 'Validate a local SKILL.md, test publishing and retrieval in Glean, confirm the downloaded file matches, and delete the test skill.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- Permission to create and delete test skills, using the SKILLS OAuth scope or the SKILLS permission on a user-scoped token.

Build "Validate skill publishing" following https://developers.glean.com/cookbook/validate-and-publish-skill

{{> ask-setup-questions}}

- What is your work email address?
- What is the path to the local SKILL.md you want to test?

{{> oauth-setup}}

1. **Copy the project onto your machine**
   Copy the runnable TypeScript Skills CLI, sample SKILL.md, and credential-free fixture tests into a new directory. OAuth uses the official @gleanwork/auth package.

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

4. **Choose an authentication path**
   OAuth is the default. @gleanwork/auth discovers your instance, registers the OAuth client dynamically, and stores credentials securely. If OAuth is unavailable, copy .env.example to .env, set GLEAN_SERVER_URL and a user-scoped GLEAN_API_TOKEN with the SKILLS permission, and skip the next step. Omit --email from the remaining commands. If email discovery finds the wrong instance, replace --email with --server-url and your complete backend HTTPS origin on the login and live commands.

5. **Sign in with OAuth**
   Run the login command with the SKILLS scope and complete authorization in your browser. Wait for the terminal command to report success before continuing. Skip this step if you configured a token in .env.

   ```bash
   npm run login -- --email "<work-email>"
   ```

6. **Verify against your instance**
   Create a uniquely named sample skill, retrieve it, compare the downloaded SKILL.md byte for byte with the upload, and permanently delete it. This verifies authentication and Skills API access before you use your own file. A mismatch fails verification but still triggers cleanup. With token authentication, run npm run verify without --email.

   ```bash
   npm run verify -- --email "<work-email>"
   ```

7. **Test your own SKILL.md**
   Pass the path to your SKILL.md. Choose an unused name and do not publish that name concurrently. The command validates, creates, retrieves, compares, and then permanently deletes the test skill. With token authentication, omit --email.
   ```bash
   npm start -- --bundle "<skill-path>" --email "<work-email>" --yes
   ```
   {{> run-cli}}
