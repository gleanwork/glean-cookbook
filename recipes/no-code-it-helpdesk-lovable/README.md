# no-code-it-helpdesk-lovable

Prompt [Lovable](https://lovable.dev/) into an IT helpdesk deflection page on the Glean Chat API — "Where do I reset my SSO password?" answered before a ticket gets filed, zero hand-written backend code.

This recipe's "code" is the prompt, not a project scaffold. There is nothing to `npm install` here.

> **Not yet tested end-to-end on a live Lovable account.** The prompt is written to the same fidelity bar as every other recipe in this cookbook — it states the exact, corrected Chat API shape literally rather than describing it in prose, precisely so an agent can't guess wrong. What's unverified is the part that's out of this cookbook's control: whether Lovable actually produces a working app from it. If you run this, please open an issue with what happened (worked as-is / needed a nudge / didn't work) so this note can be replaced with a real result.

## Run it

1. Read [`secrets-checklist.md`](secrets-checklist.md) and have `GLEAN_API_TOKEN` (scoped to `CHAT`) and `GLEAN_INSTANCE` ready.
2. Start a new project at [lovable.dev](https://lovable.dev/) and paste the entire block from [`lovable-prompt.md`](lovable-prompt.md) — fill in your instance name first.
3. When the Agent sets up a backend/secrets integration, add the two values there, not in the chat.
4. Test with the two demo queries below.

## Demo queries

- "Where do I reset my SSO password?" — should answer from the SSO password reset guide with a citation.
- "How do I request a new laptop?" — should answer from the IT helpdesk FAQ (loaner laptops, same-day) with a citation.

## Same shape as `no-code-pto-lookup-replit`, different persona

This recipe mirrors [`no-code-pto-lookup-replit`](../no-code-pto-lookup-replit/) — same Chat API call, same "the browser must never hold the token" constraint, same citation-shape correction (filter to `messageType === 'CONTENT'`, read `fragments[].citation.sourceDocument`, dedupe by `url` — not the deprecated `message.citations[]` field, and not a top-level `citedDocuments` field). What's different is the tool (Lovable vs. Replit) and the persona (IT helpdesk vs. HR), so the two don't read as duplicates in the cookbook. Lovable's default stack leans on a connected backend/database integration for anything server-side (including secrets) rather than a plain Node server — the prompt asks the Agent to set that up rather than assuming a specific mechanism up front, since that surface changes over time.

## Note on demo queries

The ticket's demo queries ("Where do I reset my SSO password?", "How do I request a new laptop?") are both directly answered by existing seeded Acme corpus documents (`support-sso-password-reset`, `support-it-helpdesk-faq`) — no corpus changes were needed for this recipe.
