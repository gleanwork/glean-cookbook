# Batch retrieve documents

These Platform Documents operations are experimental. Every request in this
project sends `X-Glean-Include-Experimental: true`. Without that header, the
server hides the operations.

This TypeScript CLI retrieves up to 100 indexed documents in one call. Each
selector is a `document_id` or a URL. Found documents come back in `results`.
Complete misses come back in `warnings` on the same HTTP 200.

The published `@gleanwork/api-client` package does not include Platform
Documents operations. `client.documents` is a different API. This project calls
`POST /api/documents/batch` with `fetch` and uses `@gleanwork/auth` for
sign-in.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with indexed documents you can open
- Your work email, or the complete Glean backend HTTPS origin
- The `documents:read` OAuth scope, or a user-scoped token with permission to
  read documents
- One document URL and one document ID for documents you can open

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/batch-retrieve-documents batch-retrieve-documents
cd batch-retrieve-documents
npm install
npm test
```

The tests pass without credentials or network access. They use the real HTTP
client with MSW handlers. Unhandled requests fail. Passing tests does not prove
access to your Glean instance.

## Choose one authentication path

### OAuth with dynamic client registration

`@gleanwork/auth` discovers your instance, registers the OAuth client, and
stores credentials outside this directory. It does not write `.env`. Login also
requests `openid` and `offline_access`.

```bash
npm run login -- --email "<work-email>"
```

Finish authorization in your browser and wait until the command reports
success. If email discovery finds the wrong instance, pass
`--server-url "https://<your-backend-origin>"` instead of `--email` on login
and on the commands below. Use the complete backend HTTPS origin.

### User-scoped token

Skip OAuth login. Copy the environment template:

```bash
cp .env.example .env
```

Set `GLEAN_SERVER_URL` and a user-scoped `GLEAN_API_TOKEN` with permission to
read documents. Do not paste the token into a prompt, issue, or committed file.
The CLI loads `.env` with Node.js. Existing shell variables win. Omit `--email`
from the commands below.

## Retrieve a mixed batch

Use selectors for documents you can open. Repeat `--url` and `--id` in the
order you want them sent. The body is `document_specs`, from 1 to 100 items.
Each item is exactly one of `document_id` or `url`.

```bash
npm run verify -- --email "<work-email>" --url "<document-url>" --id "<document-id>"
```

The request is:

```text
POST /api/documents/batch
```

It sends `X-Glean-Include-Experimental: true` and a bearer token. A successful
run prints a line like this, then `request_id`, `results`, and `warnings`:

```text
Retrieved 2 of 2 documents.
```

`results` entries are `[index] title (document_id) permalink`. The permalink
can differ from a URL you submitted. `warnings` is `(none)` when every selector
resolved. HTTP errors exit non-zero and do not print the `Retrieved` line.

## Include a miss and extracted text

Add a URL that is not an indexed document, and pass `--content`. `--content`
adds `"include": ["CONTENT"]` to the JSON body. It is not a query parameter.
The value is the uppercase enum `CONTENT`. Each found document then includes
`content.full_text_list`.

```bash
npm start -- --email "<work-email>" --url "<document-url>" --id "<document-id>" --url "https://example.invalid/not-indexed" --content
```

A complete miss is a warning on HTTP 200. The command still exits 0 and prints
both lists. A warning line looks like:

```text
[2] resource_not_found: No visible document for that URL. url=https://example.invalid/not-indexed
```

That code and message are the shape the fixtures use. The live warning text is
whatever the server returns. `resource_not_found` and `invalid_parameter` are
examples, not a closed list. There is no per-item status field.

An empty `full_text_list` means Glean has no extracted text. The CLI prints the
segment count. If requested content cannot be read, the batch fails instead of
returning documents without `content`.

An empty or malformed URL is a warning after a complete read, not HTTP 400. The
CLI rejects a blank `--url` or `--id` before it sends the request. HTTP 413
means the body is too large. More than 100 selectors is rejected in the client
and is not that 413 response. A 404 on this call means the batch route itself
failed, usually because the experimental header was omitted. It is not how a
single selector miss is reported.

## Limits

Gmail and Outlook search results and chat citations can carry caller-specific
IDs. Do not send those IDs as `document_id`. Send the document URL instead. A
URL can still come back as a `resource_not_found` warning. Federated results
and go-link shortcuts are not retrievable. You only receive documents visible
to the signed-in user.

See the [experimental API overview](https://developers.glean.com/experimental/overview)
and the [OAuth authentication guide](https://developers.glean.com/api-info/client/authentication/oauth).
