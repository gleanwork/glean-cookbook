# no-code-pto-lookup-replit

Prompt [Replit Agent](https://replit.com/) into a working HR PTO/benefits lookup tool on the Glean Chat API — zero hand-written backend code, permissions still enforced by Glean.

This recipe's "code" is the prompt, not a Node or Python project. There is nothing to `npm install` here.

> **Not yet tested end-to-end on a live Replit account.** The prompt is written to the same fidelity bar as every other recipe in this cookbook — it states the exact, corrected Chat API shape literally rather than describing it in prose, precisely so an agent can't guess wrong. What's unverified is the part that's out of this cookbook's control: whether Replit Agent actually produces a working app from it. If you run this, please open an issue with what happened (worked as-is / needed a nudge / didn't work) so this note can be replaced with a real result.

## Run it

1. Read [`secrets-checklist.md`](secrets-checklist.md) and have `GLEAN_API_TOKEN` (scoped to `CHAT`) and `GLEAN_INSTANCE` ready.
2. Start a new Repl at [replit.com](https://replit.com/new), open Agent, and paste the entire block from [`replit-agent-prompt.md`](replit-agent-prompt.md) — fill in your instance name first.
3. When the Agent asks for secrets, add them via the Secrets tab, not the chat.
4. Test with the two demo queries below.

## Demo queries

- "What is our PTO policy?" — should answer from the PTO policy doc with a citation.
- "When is open enrollment?" — should answer from the benefits guide ("Annual open enrollment runs in November") with a citation.

## A correction worth knowing about

The prompt tells the Agent to filter to `messageType === 'CONTENT'` before joining `fragments[].text`, and to read citations from `fragments[].citation.sourceDocument` (deduped by `url`) — not the deprecated `message.citations[]` field, and not a top-level `citedDocuments` field. This is the same correction documented in [`company-answers`](../company-answers/) — Replit Agent, like any LLM, will confidently guess the wrong shape here if you don't pin it down, so the prompt states the exact code rather than describing the API in prose.

## Note on the demo query change

The ticket this recipe shipped from specified "How do I enroll in the commuter benefit?" as the second demo query — too specific to assume any given company documents it, which would produce either no citation or (worse, if a model fills the gap) a fabricated answer. Swapped in "When is open enrollment?", which most companies' benefits documentation covers.
