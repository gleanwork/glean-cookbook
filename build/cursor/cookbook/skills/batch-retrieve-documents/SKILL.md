---
name: batch-retrieve-documents
description: 'Retrieve up to 100 indexed documents you can open in Glean, mixing document IDs and URLs. Documents Glean does not return are listed under warnings.'
disable-model-invocation: true
---

## Before you start

- Node.js 22.12.0 or newer
- A Glean instance where you can open indexed documents
- Your work email, or the complete Glean backend HTTPS origin
- The documents:read OAuth scope, or a user-scoped API token created with Read documents (documents:read). On the legacy token screen, choose DOCUMENTS
- One document URL you can open

Build "Batch retrieve documents" following https://developers.glean.com/cookbook/batch-retrieve-documents

Use nonsecret inputs the user already supplied. Ask only for missing information needed by the
selected recipe path, resolving dependent choices before continuing. Do not request credential
values in conversation; use the recipe's documented secure sign-in or secret-entry path. Required
questions for this recipe are:

- What is your work email address?
- What is the URL of a document you can open in Glean?
- What document ID did the first command print in parentheses on the results line?

Follow the selected authentication path. If OAuth is selected, run the recipe's shipped login
command with its declared scopes. If the documented token path is selected, skip OAuth login
and use that path's declared secure configuration. Keep sign-in and secret entry user-controlled.
Do not implement or alter OAuth while setting up the recipe, and do not silently substitute a
path when the documented one fails.

### Run the commands in order

Run the step commands in one shell session, starting in the directory where the project should be
created. A `cd` in one step still applies to later steps, so do not repeat it. If your tool starts
each command in a fresh process, run each later command from the directory the earlier `cd` entered.
A step marked (new terminal) runs while an earlier step keeps running: start it in a new shell in
the starting directory, and run the steps after it in that shell.

1. **Copy the project onto your machine**
   Copy the runnable TypeScript CLI and its offline tests into a new directory. Sign-in uses the official `@gleanwork/auth` package.

   ```bash
   npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/batch-retrieve-documents batch-retrieve-documents
   ```

2. **Install dependencies**
   Enter the project directory and install its dependencies. Run the remaining commands from this directory.

   ```bash
   cd batch-retrieve-documents && npm install
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
   Pass one URL you can open. This command prints `Retrieved N of M documents`, then `request_id`, `results`, and `warnings`. Copy the document ID in parentheses on the results line. Pass it to `--id` in the next command. With a token in `.env`, omit `--email`.

   ```bash
   npm start -- --email "<work-email>" --url "<document-url>"
   ```

7. **Include a URL that is not indexed, and extracted text**
   Repeat the URL, pass the document ID from the previous results line to `--id`, add a URL that is not an indexed document, and pass `--content`. Each result line includes `content_segments: N`. `content_segments: 0` means there is no extracted text, and you still see the document. A document ID or URL Glean does not return is listed under warnings on HTTP 200, and the command still exits 0. The warning code and message are what Glean returns. With a token, omit `--email`.
   ```bash
   npm start -- --email "<work-email>" --url "<document-url>" --id "<document-id>" --url "https://example.invalid/not-indexed" --content
   ```
   Run the command in this chat and report its concise result rather than reproducing routine install
   or debug output. Do not invent a browser URL. Then give the first verification action.
