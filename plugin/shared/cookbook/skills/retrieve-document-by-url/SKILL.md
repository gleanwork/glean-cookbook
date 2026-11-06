---
name: retrieve-document-by-url
description: 'Retrieve one indexed document you can open in Glean by its URL, then retrieve that same document by the document ID printed in the first response.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance where you can open indexed documents
- Your work email, or the complete Glean backend HTTPS origin
- The documents:read OAuth scope, or a user-scoped API token created with Read documents (documents:read). On the legacy token screen, choose DOCUMENTS

Build "Retrieve a document by URL" following https://developers.glean.com/cookbook/retrieve-document-by-url

{{> ask-setup-questions}}

- What is your work email address?
- What is the URL of a document you can open in Glean?

{{> oauth-setup}}

{{> step-shell}}

1. **Copy the project onto your machine**
   Copy the runnable TypeScript CLI and its offline tests into a new directory. Sign-in uses the official `@gleanwork/auth` package.

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/retrieve-document-by-url retrieve-document-by-url
   ```

2. **Install dependencies**
   Enter the project directory and install its dependencies. Run the remaining commands from this directory.

   ```bash
   cd retrieve-document-by-url && npm install
   ```

3. **Run the offline tests**
   Run the tests. They do not use your Glean login or the network. Passing tests does not prove you can reach your Glean instance.

   ```bash
   npm test
   ```

4. **Choose an authentication path**
   OAuth is the default. `@gleanwork/auth` discovers your instance, registers the OAuth client dynamically, and stores credentials outside the project. If OAuth is unavailable, copy `.env.example` to `.env`, set `GLEAN_SERVER_URL` to your backend origin, for example `https://<instance>-be.glean.com`, and create a user-scoped API token with Read documents (`documents:read`). On the legacy token screen, choose `DOCUMENTS`. Put that token in `GLEAN_API_TOKEN` and skip the next step. Omit `--email` from the remaining commands. If email discovery finds the wrong instance, replace `--email` with `--server-url` and that same backend origin.

5. **Sign in with OAuth**
   Run the login command with the `documents:read` scope and finish authorization in your browser. Wait until the command reports success. Skip this step when you configured a token in `.env`.

   ```bash
   npm run login -- --email "<work-email>"
   ```

6. **Verify against your instance**
   Retrieve one document you can open, then retrieve it again by the returned `document_id`. The command prints the permalink, title, datasource, and both request IDs. With a token in `.env`, omit `--email`.

   ```bash
   npm start -- --email "<work-email>" --url "<document-url>"
   ```

7. **Request extracted text**
   Run the same retrieval with `--content`. The command prints `content_segments:` and a short `content_preview:` of the first non-empty segment, or the line `content: no extracted text`. You still see the document when there is no extracted text. If Glean cannot read the text you asked for, the command fails. With a token, omit `--email`.
   ```bash
   npm start -- --email "<work-email>" --url "<document-url>" --content
   ```
   {{> run-cli}}
