# no-code-pto-lookup-replit

Prompt [Replit Agent](https://replit.com/) into a private HR PTO/benefits lookup prototype on the Glean Chat API — zero hand-written backend code.

The backend uses one Glean API token, so every request has that token owner's access. This is a single-user prototype: keep the Repl private and do not share or deploy it to other users. A multi-user app must authenticate each user and use a per-user OAuth token; a shared service token does not provide per-user permissions.

This recipe's "code" is the prompt, not a Node or Python project. There is nothing to `npm install` here.

> **Status:** Not yet tested end-to-end on a live Replit account.

## Run it

1. Read [`secrets-checklist.md`](secrets-checklist.md) and have `GLEAN_API_TOKEN` (scoped to `CHAT`) and `GLEAN_INSTANCE` ready.
2. Start a new Repl at [replit.com](https://replit.com/new), open Agent, and paste the entire block from [`replit-agent-prompt.md`](replit-agent-prompt.md) — fill in your instance name first.
3. When the Agent asks for secrets, add them via the Secrets tab, not the chat.
4. Test with the two demo queries below.

## Demo queries

- "What is our PTO policy?" — should answer from the PTO policy doc with a citation.
- "When is open enrollment?" — should answer from the benefits guide ("Annual open enrollment runs in November") with a citation.

## Chat response shape

Filter to `messageType === 'CONTENT'` before joining `fragments[].text`. Read citations from `fragments[].citation.sourceDocument`, deduped by `url`; do not use the deprecated `message.citations[]` field or a top-level `citedDocuments` field.
