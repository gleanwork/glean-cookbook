# no-code-pto-lookup-replit

Prompt [Replit Agent](https://replit.com/) into a private HR PTO/benefits lookup prototype on the Glean Chat API, with zero hand-written backend code.

The backend uses one Glean API token, so every request has that token owner's access. This is a single-user prototype: keep the Repl private and do not share or deploy it to other users. A multi-user app must authenticate each user and use a per-user OAuth token; a shared service token does not provide per-user permissions.

This recipe's "code" is the prompt, not a Node or Python project. There is nothing to `npm install` here.

This walkthrough has not been run end-to-end against a live Replit account. Confirm the two demo queries on your own instance before you rely on the generated app.

## Run it

1. Read [`secrets-checklist.md`](secrets-checklist.md) and have `GLEAN_API_TOKEN` (scoped to `CHAT`) and `GLEAN_INSTANCE` ready.
2. Start a new private Repl at [replit.com](https://replit.com/new), open Agent, and paste the entire block from [`replit-agent-prompt.md`](replit-agent-prompt.md). Fill in your instance name and the first suggested question first.
3. When the Agent asks for secrets, add them via the Secrets tab, not the chat.
4. Test with the two demo queries below.

## Demo queries

- "What is our PTO policy?" should return a cited answer from your own indexed content.
- "what's our revenue?" should not fabricate an answer when Glean cites nothing. The assistant should show an explicit no-answer state.

## Chat response shape

Filter to `messageType === 'CONTENT'` before joining `fragments[].text`. Read citations from `fragments[].citation.sourceDocument`, deduped by `url`. Do not use the deprecated `message.citations[]` field or a top-level `citedDocuments` field.
