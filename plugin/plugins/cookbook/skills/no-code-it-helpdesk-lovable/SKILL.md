---
name: no-code-it-helpdesk-lovable
description: 'Prompt Lovable into an IT helpdesk deflection page on the Glean Chat API — zero hand-written backend, permissions enforced by Glean.'
disable-model-invocation: true
---

I'm using Lovable, not you, to build this — your job is to prepare my
inputs per
https://developers.glean.com/cookbook/no-code-it-helpdesk-lovable

1. Generate the Lovable prompt from the recipe's template, filling in
   my Glean server URL.
2. Remind me: token goes in a Lovable backend secret, never in the
   prompt.
3. After Lovable builds it, hand it back to me — see Verify below for
   the exact queries to test and what a correct result looks like.

## Reference

Have Lovable keep the Glean token in its server-side secret store and call Client Chat from a backend function. Read answer text from CONTENT messages and citations from fragment.citation.sourceDocument. Never expose the token in browser code. Treat empty answer text as a retryable failure and show cited answers or an explicit no-answer state.

## Verify

{{> verify-gate-third-party}}

- **Query:** "Where do I reset my SSO password?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request a new laptop?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
