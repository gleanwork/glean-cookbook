# Retrieve a document by URL

This command reads one indexed document you can open in Glean, then reads it
again by the `document_id` printed in the first response. The second call
checks that the ID you would store still points at the same document.

These document endpoints are experimental. This project sends
`X-Glean-Include-Experimental: true` on every request. If the endpoints are
off, you still see HTTP 404 and a Request ID. Ask your Glean admin or Glean
support, and share that Request ID. The command already sends the header, so
you do not add it yourself.

The published `@gleanwork/api-client` package does not include these document
endpoints. `client.documents` is a different API. This project calls
`GET /api/documents` with `fetch` and uses `@gleanwork/auth` for sign-in.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance where you can open indexed documents
- Your work email, or the complete Glean backend HTTPS origin
- The `documents:read` OAuth scope, or a user-scoped API token created with
  `documents:read` (legacy label `DOCUMENTS`)

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/retrieve-document-by-url retrieve-document-by-url
cd retrieve-document-by-url
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
and on the command below. Use the complete backend HTTPS origin.

### User-scoped token

Skip OAuth login. Copy the environment template:

```bash
cp .env.example .env
```

Set `GLEAN_SERVER_URL`. Create a user-scoped API token and choose
`documents:read` (legacy label `DOCUMENTS`). Put that token in
`GLEAN_API_TOKEN`. Do not paste the token into a prompt, issue, or committed
file. The CLI loads `.env` with Node.js. Existing shell variables win. Omit
`--email` from the command below.

## Retrieve a document

Use a URL you can open. The command calls:

```text
GET /api/documents?url=<url>
GET /api/documents/<document_id>
```

The second path segment is URL-encoded, so an ID that contains `/` stays one
segment. Both calls send `X-Glean-Include-Experimental: true` and a bearer
token.

```bash
npm start -- --email "<work-email>" --url "<document-url>"
```

A successful run prints the title, a `document_id:` line, the permalink,
datasource, document type, timestamps, a `url_request_id:` line, and this
line:

```text
Round-trip document_id matches (request <id-lookup-request-id>).
```

The permalink can differ from the URL you passed. The command prints both
when they differ. Copy the `document_id:` line if you later want to read the
same document in the batch recipe. HTTP errors exit non-zero and do not print
the `Round-trip` line.

## Request extracted text

`--content` adds `include=CONTENT` on both requests. The value is the
uppercase enum `CONTENT`. The response then includes
`document.content.full_text_list`.

```bash
npm start -- --email "<work-email>" --url "<document-url>" --content
```

An empty list means Glean has no extracted text for that document. You still
see the document. The command prints `content_segments:` and a short
`content_preview:` of the first non-empty segment, or the line
`content: no extracted text`. If Glean cannot read the text you asked for,
the command fails instead of printing the document without `content`.

## Errors you may see

HTTP 403 prints `HTTP 403`, a `Request ID:` line, and a hint. The hint lists
possible causes: the API token was created without `documents:read` (legacy
label `DOCUMENTS`), or your Glean instance is not set up for this access.
OAuth login already requests `documents:read`, so running login again does
not add that scope. Share the Request ID with your Glean admin or Glean
support.

HTTP 404 prints `HTTP 404`, a `Request ID:` line, and a hint. The command
already sends `X-Glean-Include-Experimental: true`. A 404 usually means your
Glean instance does not have these experimental document endpoints turned on.
Ask your Glean admin or Glean support, and share the Request ID. If the
endpoints are on, a 404 usually means the document does not exist or you
cannot access it.

## Limits

A Gmail or Outlook search result or chat citation can show an ID that only
works in that result. Do not pass that ID to the second call. Pass the
message URL. That URL can still return 404. Go links and federated search
results cannot be retrieved. You only get documents you can open. A missing
document and a document you cannot access both show as HTTP 404 on this
command, which is the same status you see when the endpoints are turned off.
Use the Request ID with your Glean admin or Glean support to tell those
cases apart.

See the [experimental API overview](https://developers.glean.com/experimental/overview)
and the [OAuth authentication guide](https://developers.glean.com/api-info/client/authentication/oauth).
