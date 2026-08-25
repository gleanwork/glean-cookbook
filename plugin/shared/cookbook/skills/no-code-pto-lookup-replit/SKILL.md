---
name: no-code-pto-lookup-replit
description: 'Paste a prompt into Replit Agent to get a private page that answers PTO and benefits questions from your Glean docs.'
disable-model-invocation: true
---

## Before you start

- A Replit account with Agent access
- A Glean Client API token with the CHAT scope. Create it in Admin Console → API access → Client API tokens, and keep it in Replit Secrets. Every request uses that token owner's access
- A private Repl. Multi-user deployments require authenticated per-user Glean OAuth

Build "Build a PTO lookup page in Replit" following https://developers.glean.com/cookbook/no-code-pto-lookup-replit

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- What HR topic do you know your docs cover?

1. **Copy your instance name**
   Copy the instance name from the lookup on this page, or from `https://app.glean.com/admin/about-glean`. For `https://acme-be.glean.com` that value is `acme`, not the full URL and not `app.glean.com`. Cookbook plugin users can run `resolve-backend.mjs` with the work email and use the `instance` field.

2. **Copy the prompt into a private Repl**
   Click `Copy Replit prompt`. Replace `<your-glean-instance>` with your instance name. Paste the result into a new private Repl at `https://replit.com/new` and open Agent. Cookbook plugin users: the same text is in `replit-agent-prompt.md` next to this skill.

3. **Add secrets when Replit asks**
   When Replit Agent asks, add `GLEAN_API_TOKEN` and `GLEAN_INSTANCE` in the Secrets tab, never in the chat. This token is one person's Glean access. Keep the Repl private.

4. **Ask a PTO question, then an off-topic one**
   Ask "What is our PTO policy?" and confirm a cited answer from your own docs. Then ask "what's our revenue?" and confirm the assistant does not invent an answer when Glean cites nothing.
