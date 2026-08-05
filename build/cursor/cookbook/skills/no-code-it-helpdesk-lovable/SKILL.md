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

This recipe's deliverable is a prompt template, not a runnable project — mirrors no-code-pto-lookup-replit's shape (same Chat API call, same "browser never holds the token" constraint, same citation correction: filter to messageType === 'CONTENT' before joining fragments[].text, and read citations from fragments[].citation.sourceDocument — not the deprecated message.citations[] field, which wasn't populated at all on a live test response) with a different tool and persona so the two don't read as duplicates. Lovable's default stack leans on a connected backend/database integration for server-side secrets rather than a plain Node server, so the prompt asks the agent to set that up rather than assuming a fixed mechanism. Both demo queries are the kind almost every company's IT documentation answers, so the recipe works against the reader's own instance with no seeding. A chat run that invoked a server tool can return HTTP 200 with the run unfinished: the CONTENT message is present but its fragments carry no text, the final message is a SERVER_TOOL, and no error field appears anywhere. Verified live at roughly one run in four for a tool-invoking question. Treat an empty joined answer as a failure and surface it -- rendering the empty string shows a blank answer panel and reads as a broken app.

## Verify

This recipe's app is built and run by a separate tool (Lovable, Replit), not by you. Before
telling me you're done, give me the queries below to test myself in the running app, along with
what a correct result looks like:

- **Query:** "Where do I reset my SSO password?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request a new laptop?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
