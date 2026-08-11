---
name: no-code-pto-lookup-replit
description: 'Prompt Replit Agent into a private, single-user HR lookup prototype on the Glean Chat API — zero hand-written backend.'
disable-model-invocation: true
---

## Before you start

- Required API scopes (for paths that use API credentials): `CHAT`
- A Replit account with Agent access
- A Glean API token with the CHAT scope (kept in Replit Secrets; every request uses this one token owner's access)
- A private Repl — multi-user deployments require authenticated per-user Glean OAuth

Ask these before running commands. Ask one at a time, waiting for each answer before asking the
next — do not put them all in one message:

- What is your work email? It is used once to discover your Glean tenant.
- What HR topic do you know exists in your Glean content?

I'm using Replit Agent, not you, to build this — your job is to prepare
my inputs per
https://developers.glean.com/cookbook/no-code-pto-lookup-replit

1. Resolve my Glean server URL from the work email already supplied with the cookbook plugin's resolve-backend.mjs script, then fill it and the supplied topic into the recipe prompt template.
2. Remind me: token goes in Replit Secrets as GLEAN_API_TOKEN, never
   in the prompt. It is one service identity, so keep this prototype
   private; multi-user deployment requires per-user Glean OAuth.
3. After Replit builds it, hand it back to me — see Verify below for
   the exact queries to test and what a correct result looks like.

## Reference

Keep this single-user prototype private. Its shared backend token is one service identity, so every request has the token owner's access; it does not enforce permissions for each visitor. Multi-user deployment requires app authentication and per-user Glean OAuth. Keep the token server-side, call glean.client.chat.create with USER message fragments, read CONTENT text and fragment.citation.sourceDocument citations, and show cited answers or an explicit no-answer state.

## Verify

This recipe's app is built and run by a separate tool (Lovable, Replit), not by you. Before
telling me you're done, give me the scenarios below to test myself in the running app, along with
what a correct result looks like. If my instance does not contain the named topic, ask me for an
equivalent topic I know exists rather than treating the example query as a universal requirement:

- **Query:** "What is our PTO policy?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.

- **Query:** "When is open enrollment?"
  **Expected:** Returns a non-empty answer with at least one citation carrying a real title and URL, drawn from your own indexed content.
