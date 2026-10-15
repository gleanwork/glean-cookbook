# Retrieve a document by URL

These Platform Documents operations are experimental. Every request in this
project sends `X-Glean-Include-Experimental: true`. Without that header, the
server hides the operations.

This TypeScript CLI retrieves one indexed document by URL, then retrieves it
again by the `document_id` from that response. The second call checks that the
ID you would store still points at the same document.

The published `@gleanwork/api-client` package does not include Platform
Documents operations. `client.documents` is a different API. This project calls
`GET /api/documents` with `fetch` and uses `@gleanwork/auth` for sign-in.

## Prerequisites

- Node.js 22.12.0 or newer
- A Glean instance with indexed documents you can open
- Your work email, or the complete Glean backend HTTPS origin
- The `documents:read` OAuth scope, or a user-scoped token with permission to
  read documents

## Copy and test the project

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/retrieve-document-by-url retrieve-document-by-url
cd retrieve-document-by-url
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
npm run verify -- --email "<work-email>" --url "<document-url>"
```

A successful run prints the title, `document_id`, permalink, datasource,
document type, timestamps, the URL lookup `request_id`, and this line:

```text
Round-trip document_id matches (request <id-lookup-request-id>).
```

The permalink can differ from the URL you passed. The command prints both when
they differ. HTTP errors, including 404, exit non-zero and do not print that
line.

## Request extracted text

`--content` adds `include=CONTENT` on both requests. The value is the uppercase
enum `CONTENT`. The response then includes `document.content.full_text_list`.

```bash
npm start -- --email "<work-email>" --url "<document-url>" --content
```

An empty list means Glean has no extracted text for that document. The CLI
prints the segment count and a short preview of the first non-empty segment.
If requested content cannot be read, the request fails instead of returning the
document without `content`.

## Limits

Gmail and Outlook search results and chat citations can carry caller-specific
IDs. Get by ID cannot resolve those IDs. Retrieve those documents by URL. A
Gmail or Outlook URL can still return 404. Federated results and go-link
shortcuts are not retrievable. You only receive documents visible to the signed-in
user. A missing document and a document you cannot access both surface as 404
on this single-document call.

See the [experimental API overview](https://developers.glean.com/experimental/overview)
and the [OAuth authentication guide](https://developers.glean.com/api-info/client/authentication/oauth).
