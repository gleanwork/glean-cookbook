---
name: no-code-pto-lookup-replit
description: 'Prompt Replit Agent into a private, single-user HR lookup prototype on the Glean Chat API, with zero hand-written backend.'
disable-model-invocation: true
---

## Before you start

- A Replit account with Agent access
- A Glean Client API token with the CHAT scope. Create it in Admin Console → API access → Client API tokens, then keep it in Replit Secrets; every request uses this one token owner's access
- A private Repl. Multi-user deployments require authenticated per-user Glean OAuth

Build "PTO and benefits lookup, no code, on Replit" following https://developers.glean.com/cookbook/no-code-pto-lookup-replit

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- What HR topic should the first suggested question cover? Pick something you know exists in your Glean content.

1. **Resolve your Glean instance**
   Copy the instance slug from your Glean URL, the part in https://<instance>-be.glean.com. That slug is GLEAN_INSTANCE. Plugin users run the command instead and take the same slug from the returned URL.

   ```bash
   node <cookbook-plugin-root>/scripts/resolve-backend.mjs "<work-email>"
   ```

2. **Fill the prompt template**
   Open recipes/no-code-pto-lookup-replit/replit-agent-prompt.md. Replace <your-glean-instance> with the instance slug, and set the first suggested question to a natural question about the supplied topic. Plugin users show the filled prompt and stop. Do not open Replit.

3. **Paste into a new private Repl**
   Start a new private Repl at https://replit.com/new, open Agent, and paste the filled prompt as the first message. Plugin users hand the filled prompt to the user. Do not open Replit.

4. **Add secrets when Replit asks**
   When Replit Agent asks, add GLEAN_API_TOKEN and GLEAN_INSTANCE in the Secrets tab, never in the chat. The token is one service identity. Keep the Repl private.

5. **Verify with two live questions**
   Ask "What is our PTO policy?" and confirm a cited answer from your own indexed content. Then ask "what's our revenue?" and confirm the assistant does not fabricate an answer when Glean cites nothing.
