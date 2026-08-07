---
name: no-code-it-helpdesk-lovable
description: 'Prompt Lovable into a private, single-user IT helpdesk prototype on the Glean Chat API — zero hand-written backend.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `CHAT`
- A Lovable account
- A Glean API token with the CHAT scope (kept as a Lovable backend secret; every request uses this one token owner's access)
- A private Lovable project — multi-user deployments require authenticated per-user Glean OAuth

I'm using Lovable, not you, to build this — your job is to prepare my
inputs per
https://developers.glean.com/cookbook/no-code-it-helpdesk-lovable

1. Generate the Lovable prompt from the recipe's template, filling in
   my Glean server URL.
2. Remind me: token goes in a Lovable backend secret, never in the
   prompt. It is one service identity, so keep this prototype private;
   multi-user deployment requires per-user Glean OAuth.
3. After Lovable builds it, hand it back to me — see Verify below for
   the exact queries to test and what a correct result looks like.

## Reference

Keep this single-user prototype private. Its shared backend token is one service identity, so every request has the token owner's access; it does not enforce permissions for each visitor. Multi-user deployment requires app authentication and per-user Glean OAuth. Keep the token in Lovable's server-side secret store, call Client Chat from a backend function, and read CONTENT text and fragment.citation.sourceDocument citations.

## Verify

This recipe's app is built and run by a separate tool (Lovable, Replit), not by you. Before
telling me you're done, give me the scenarios below to test myself in the running app, along with
what a correct result looks like. If my instance does not contain the named topic, ask me for an
equivalent topic I know exists rather than treating the example query as a universal requirement:

- **Query:** "Where do I reset my SSO password?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
- **Query:** "How do I request a new laptop?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
