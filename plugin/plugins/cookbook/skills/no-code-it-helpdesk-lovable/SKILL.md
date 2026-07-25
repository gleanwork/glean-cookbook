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
3. After Lovable builds it, give me the two demo queries to verify
   citations and permissions.

## Reference

This recipe's deliverable is a prompt template, not a runnable project — mirrors no-code-pto-lookup-replit's shape (same Chat API call, same "browser never holds the token" constraint, same citation correction at message.citations[].sourceDocument, not a top-level citedDocuments field) with a different tool and persona so the two don't read as duplicates. Lovable's default stack leans on a connected backend/database integration for server-side secrets rather than a plain Node server, so the prompt asks the agent to set that up rather than assuming a fixed mechanism. Both demo queries are answered by existing seeded Acme corpus documents — no corpus changes were needed.
