# Validate and publish a skill

Validate a local `SKILL.md`, create a skill in your Glean instance, retrieve it,
and confirm that its downloaded `SKILL.md` matches the upload byte for byte.
**Both commands delete the test skill afterward.**
They do not leave a published skill for you to use.

The API returns a ZIP archive. The example uses `yauzl` to read its single root
`SKILL.md` in memory, checks its checksum, and compares its bytes with the uploaded
file. It never extracts files to disk or executes the skill.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- Permission to create and delete test skills using OAuth or a user-scoped token
  with the `SKILLS` scope

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill
cd validate-and-publish-skill
npm install
npm test
```

All tests should pass. They use a fake API and need no credentials or network
access. Passing them does not verify access to your Glean instance.

## Choose one authentication path

### OAuth

```bash
npm run login -- --email "<work-email>"
```

Approve sign-in in your browser. The command runs the official
`@gleanwork/auth` CLI with the `SKILLS` scope. The package handles login and
stores your refreshable credentials outside this project. The newer
`skills:read` and `skills:write` scopes are not supported yet.

If email discovery finds the wrong instance, replace `--email` with
`--server-url "https://your-backend-origin"` on login and subsequent commands.
If your administrator supplies an OAuth client ID, export
`GLEAN_OAUTH_CLIENT_ID` before login. Login does not load `.env`.

### User-scoped token

Skip OAuth login. Copy the environment template:

```bash
cp .env.example .env
```

Set `GLEAN_SERVER_URL` and `GLEAN_API_TOKEN` in the ignored `.env` file.
Never paste your token into a prompt, issue, or committed file. The CLI uses
Node.js to load `.env`; existing shell variables take precedence.

## Verify against your instance

This command creates a uniquely named test skill, retrieves it by its returned
ID, verifies its downloaded content against the upload, and permanently deletes
the test skill. A mismatch fails verification; cleanup still runs.

With OAuth:

```bash
npm run verify -- --email "<work-email>"
```

With a token in `.env`:

```bash
npm run verify
```

Success ends with a line like this:

```text
Verified <name> (<id>) at version 1.0; downloaded <n> byte(s); SKILL.md matches the upload; cleanup completed.
```

Authentication, validation, retrieval, content-comparison, and cleanup failures
exit with an error.
A failed delete prints the remaining skill ID and a cleanup command. Inspect
that ID before using the command; never delete a skill found only by its name.

## Test your own SKILL.md

The default is the included `fixtures/sample-skill/SKILL.md`. Choose an unused
name and do not publish that name concurrently from another process.

With OAuth:

```bash
npm start -- --email "<work-email>" --yes
```

With a token in `.env`:

```bash
npm start -- --yes
```

Add `--bundle path/to/SKILL.md` to test a different file. **This command also
deletes the test skill afterward.** It does not modify your local file.

## Mutation and download limits

- Creating an existing name can add a version. The example checks for an
  existing name before uploading a supplied file, but that check is not atomic.
  If the create response reports a later version, it stops without deleting
  the skill. Inspect the reported ID before continuing.
- Creation has no automatic retries. If a request times out after the server
  saves the skill, its ID may not be available for automatic cleanup. Inspect
  your instance before trying again.
- This quickstart uploads one `SKILL.md`, so the downloaded ZIP must contain
  exactly that regular file at its root. Missing, extra, or symbolic-link entries,
  malformed ZIPs, checksum errors, and changed file bytes fail verification.
- Downloads are limited to 10 MiB. Decompression is bounded by the uploaded file's
  byte length, even if the archive declares a false size. Nothing is extracted to
  disk or executed. Matching file bytes does not prove that an agent will execute
  the skill correctly.
- The API is experimental. Instance availability, scope policy, and response
  behavior still require live verification.
