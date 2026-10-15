# Batch retrieve documents

This command reads up to 100 indexed documents you can open in Glean, in one
call. You pass each document as `--url` or `--id`. Documents Glean returns
are printed under `results`. A document ID or URL Glean does not return is
printed under `warnings` on the same HTTP 200. The command still exits 0.

These document endpoints are experimental. This project sends
`X-Glean-Include-Experimental: true` on every request. If the endpoints are
off, you still see HTTP 404 and a Request ID. Ask your Glean admin or Glean
support, and share that Request ID. The command already sends the header, so
you do not add it yourself.

The published `@gleanwork/api-client` package does not include these document
endpoints. `client.documents` is a different API. This project calls
`POST /api/documents/batch` with `fetch` and uses `@gleanwork/auth` for
sign-in.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance where you can open indexed documents
- Your work email, or the complete Glean backend HTTPS origin
- The `documents:read` OAuth scope, or a user-scoped API token created with
  `documents:read` (legacy label `DOCUMENTS`)
- One document URL you can open
- One document ID. Run `retrieve-document-by-url` first and copy the
  `document_id:` line it prints. Pass that value to `--id` here. Do not use
  an ID copied from a Gmail or Outlook search result or chat citation.

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/batch-retrieve-documents batch-retrieve-documents
cd batch-retrieve-documents
npm install
npm test
```

The tests pass without your Glean login or network access. Passing tests does
not prove you can reach your Glean instance.

## Choose one authentication path

### OAuth with dynamic client registration

`@gleanwork/auth` discovers your instance, registers the OAuth client, and
stores credentials outside this directory. It does not write `.env`. Login
also requests `openid` and `offline_access`.

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

Set `GLEAN_SERVER_URL`. Create a user-scoped API token and choose
`documents:read` (legacy label `DOCUMENTS`). Put that token in
`GLEAN_API_TOKEN`. Do not paste the token into a prompt, issue, or committed
file. The CLI loads `.env` with Node.js. Existing shell variables win. Omit
`--email` from the commands below.

## Retrieve documents by URL and ID

Repeat `--url` and `--id` in the order you want them sent. To get a document
ID, run the retrieve-by-URL recipe and copy the `document_id:` line. The
request body is `document_specs`, from 1 to 100 items. Each item is a
`document_id` or a `url`, not both.

```bash
npm start -- --email "<work-email>" --url "<document-url>" --id "<document-id>"
```

The request is:

```text
POST /api/documents/batch
```

It sends `X-Glean-Include-Experimental: true` and a bearer token. A successful
run prints a line like this, then `request_id:`, `results:`, and `warnings:`:

```text
Retrieved 2 of 2 documents.
```

Each results line looks like `[index] title (document_id) permalink`. The
permalink can differ from a URL you passed. When Glean returns every document,
you see:

```text
warnings:
  (none)
```

HTTP errors exit non-zero and do not print the `Retrieved` line.

## Include a URL Glean does not have, and extracted text

Repeat the URL and document ID from the previous command, add a URL that is
not an indexed document, and pass `--content`. `--content` adds
`"include": ["CONTENT"]` to the JSON body. It is not a query parameter. The
value is the uppercase enum `CONTENT`. Each document Glean returns then
includes `content.full_text_list`.

```bash
npm start -- --email "<work-email>" --url "<document-url>" --id "<document-id>" --url "https://example.invalid/not-indexed" --content
```

A document ID or URL Glean does not return is a warning on HTTP 200. The
command still exits 0 and prints both lists. You might see a warning line
like:

```text
[2] resource_not_found: No visible document for that URL. url=https://example.invalid/not-indexed
```

That line shows the position, a code, Glean's message, and the URL or
document ID you sent. `resource_not_found` and `invalid_parameter` are
examples of codes Glean may return. Glean can return other codes. There is
no separate status field on each document. The code and message you see are
the ones Glean sends back.

An empty `full_text_list` means Glean has no extracted text. You still see
the document under `results`, with `content_segments: 0`. If Glean cannot
read the text you asked for, the command fails instead of printing documents
without `content`.

If a URL is empty or malformed, Glean still accepts the batch and lists that
URL under `warnings` on HTTP 200. You do not get HTTP 400 for that URL. This
CLI rejects a blank `--url` or `--id` before it sends the request, so you
see `error: --url must not be blank.` or `error: --id must not be blank.`
HTTP 413 means the request body is too large. Sending more than 100 document
IDs and URLs is rejected in this CLI before the request, and that error is
not HTTP 413.

HTTP 404 means these document endpoints are not turned on for your Glean
instance. The command already sends the experimental header. Ask your Glean
admin or Glean support, and share the Request ID on screen. A single document
ID or URL that Glean cannot resolve is listed under `warnings`, not as HTTP 404.

## Errors you may see

HTTP 403 prints `HTTP 403`, a `Request ID:` line, and a hint. The hint lists
possible causes: the API token was created without `documents:read` (legacy
label `DOCUMENTS`), or your Glean instance is not set up for this access.
OAuth login already requests `documents:read`, so running login again does
not add that scope. A document you cannot open is listed under `warnings`
on HTTP 200, not as HTTP 403. Share the Request ID with your Glean admin or
Glean support.

## Limits

A Gmail or Outlook search result or chat citation can show an ID that only
works in that result. Do not pass that ID to `--id`. Pass the message URL
with `--url`. That URL can still show up under `warnings` with code
`resource_not_found`. Go links and federated search results cannot be
retrieved. You only get documents you can open.

See the [experimental API overview](https://developers.glean.com/experimental/overview)
and the [OAuth authentication guide](https://developers.glean.com/api-info/client/authentication/oauth).
