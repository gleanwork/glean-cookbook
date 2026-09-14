# Validate skill publishing

Confirm that a local `SKILL.md` can be published and retrieved through the Skills
API. This quickstart first checks access with a generated sample, then tests your
file. Both commands compare the downloaded `SKILL.md` with the upload byte for byte
and delete the test skill. They do not leave a published skill for you to use.

The API returns a ZIP archive. The example uses `yauzl` to read its single root
`SKILL.md` in memory, checks its checksum, and compares its bytes with the uploaded
file. It never extracts files to disk or executes the skill.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with the experimental Skills Platform APIs enabled
- Your work email, or the complete Glean backend HTTPS origin
- Permission to create and delete test skills using the `SKILLS` OAuth scope or
  the `SKILLS` permission on a user-scoped token

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill
cd validate-and-publish-skill
npm install
npm test
```

All tests should pass without real credentials or network access. Workflow tests
use the real SDK with MSW HTTP handlers, following the other API recipes. Unhandled
requests fail instead of reaching a live service. CLI smoke tests cover help and
local argument handling. Passing tests does not verify access to your Glean instance.

## Choose one authentication path

### OAuth with dynamic client registration

`@gleanwork/auth` discovers your instance, dynamically registers the OAuth client,
and stores credentials securely.

```bash
npm run login -- --email "<work-email>"
```

Complete authorization in your browser. Wait for the terminal command to report
success before continuing. If email discovery finds the wrong instance, replace
`--email` with `--server-url "https://your-backend-origin"` on login and subsequent
commands.

### User-scoped token

Skip OAuth login. Copy the environment template:

```bash
cp .env.example .env
```

Use a user-scoped API token with the `SKILLS` permission. Set `GLEAN_SERVER_URL`
and `GLEAN_API_TOKEN` in the ignored `.env` file.
Never paste your token into a prompt, issue, or committed file. The CLI uses
Node.js to load `.env`; existing shell variables take precedence.

## Verify access with a generated sample

This command creates a uniquely named sample skill, retrieves it by its returned
ID, verifies its downloaded content against the upload, and permanently deletes
the test skill. Run it before testing your own file. A mismatch fails verification;
cleanup still runs.

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
Verified <name> (<id>) at version 1.1; downloaded <n> byte(s); SKILL.md matches the upload; cleanup completed.
```

Authentication, validation, retrieval, content-comparison, and cleanup failures
exit with an error.
A failed delete prints the remaining skill ID and a cleanup command. Inspect
that ID before using the command; never delete a skill found only by its name.

## Test your own SKILL.md

Choose an unused skill name and do not publish that name concurrently from another
process.

With OAuth:

```bash
npm start -- --bundle path/to/SKILL.md --email "<work-email>" --yes
```

With a token in `.env`:

```bash
npm start -- --bundle path/to/SKILL.md --yes
```

This command validates, creates, retrieves, compares, and then permanently deletes
the test skill. It does not modify your local file.

## Mutation and download limits

- Creating an existing name can add a version. The example checks for an
  existing name before uploading a supplied file, but that check is not atomic.
  A new skill starts at version 1.1. If the create response reports any other
  version, the command stops without deleting the skill. Inspect the reported ID
  before continuing.
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
