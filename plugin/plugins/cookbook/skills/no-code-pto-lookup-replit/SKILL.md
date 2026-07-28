---
name: no-code-pto-lookup-replit
description: 'Prompt Replit Agent into a working HR lookup tool on the Glean Chat API — zero hand-written backend, permissions enforced by Glean.'
disable-model-invocation: true
---

I'm using Replit Agent, not you, to build this — your job is to prepare
my inputs per
https://developers.glean.com/cookbook/no-code-pto-lookup-replit

1. Generate the Replit prompt from the recipe's template, filling in
   my Glean server URL.
2. Remind me: token goes in Replit Secrets as GLEAN_API_TOKEN, never
   in the prompt.
3. After Replit builds it, give me the two demo queries to verify
   citations and permissions.

## Reference

This recipe's deliverable is a prompt template, not a runnable project — "building" it means pasting the prompt into Replit Agent, which then writes and runs the actual code. The prompt pins the same Chat API shape used elsewhere in this cookbook: Glean({ apiToken, instance }) (never `domain`), chat.create({ messages: [{ author: 'USER', fragments: [{ text }] }] }), filtering the response to messageType === 'CONTENT' before joining fragments[].text (a real response can include earlier step-narration messages), and reading citations from fragments[].citation.sourceDocument — not the deprecated message.citations[] field, which wasn't populated at all on a live test response. The demo query "How do I enroll in the commuter benefit?" from this recipe's source ticket was swapped for "When is open enrollment?" because the seeded Acme benefits guide doesn't mention a commuter benefit — asking the original question would produce no citation or a fabricated answer.
