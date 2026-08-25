# no-code-it-helpdesk-lovable

Prompt [Lovable](https://lovable.dev/) into a private IT helpdesk prototype on the Glean Chat API. "Where do I reset my SSO password?" answered before a ticket gets filed, with zero hand-written backend code.

The backend uses one Glean API token, so every request has that token owner's access. This is a single-user prototype: keep the project private and do not share or deploy it to other users. A multi-user app must authenticate each user and use a per-user OAuth token; a shared service token does not provide per-user permissions.

This recipe's "code" is the prompt, not a project scaffold. There is nothing to `npm install` here.

This walkthrough has not been run end-to-end against a live Lovable account. Confirm the two demo queries on your own instance before you rely on the generated app.

## Run it

1. Read [`secrets-checklist.md`](secrets-checklist.md) and have `GLEAN_API_TOKEN` (scoped to `CHAT`) and `GLEAN_INSTANCE` ready.
2. Start a new private project at [lovable.dev](https://lovable.dev/) and paste the entire block from [`lovable-prompt.md`](lovable-prompt.md). Fill in your instance name and the first suggested question first.
3. When the Agent sets up a backend/secrets integration, add the two values there, not in the chat.
4. Test with the two demo queries below.

## Demo queries

- "Where do I reset my SSO password?" should return a cited answer from your own indexed content.
- "How do I request a new laptop?" should return a cited answer from your own indexed content.

## Chat response shape

Filter to `messageType === 'CONTENT'`, read citations from `fragments[].citation.sourceDocument`, and dedupe them by `url`. Keep the token in Lovable's server-side secret store and make the Glean call from a backend function.

## Note on demo queries

The demo queries are the kind of question almost every company's IT documentation answers, so the recipe works against your own instance without any seeding.
