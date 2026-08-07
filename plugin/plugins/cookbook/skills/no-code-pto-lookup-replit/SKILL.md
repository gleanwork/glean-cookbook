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
3. After Replit builds it, hand it back to me — see Verify below for
   the exact queries to test and what a correct result looks like.

## Reference

Have Replit keep the Glean token server-side and call glean.client.chat.create with USER message fragments. Construct Glean with apiToken plus instance or serverURL. Read answer text from CONTENT messages and citations from fragment.citation.sourceDocument. Never expose the token in browser code. Treat empty answer text as a retryable failure and show cited answers or an explicit no-answer state.

## Verify

{{> verify-gate-third-party}}

- **Query:** "What is our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "When is open enrollment?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
