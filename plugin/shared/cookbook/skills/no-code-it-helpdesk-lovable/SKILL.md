---
name: no-code-it-helpdesk-lovable
description: 'Prompt Lovable into a private, single-user IT helpdesk prototype on the Glean Chat API, with zero hand-written backend.'
disable-model-invocation: true
---

## Before you start

- A Lovable account
- A Glean Client API token with the CHAT scope. Create it in Admin Console → API access → Client API tokens, then keep it as a Lovable backend secret; every request uses this one token owner's access
- A private Lovable project. Multi-user deployments require authenticated per-user Glean OAuth

Build "IT helpdesk deflection page, no code, on Lovable" following https://developers.glean.com/cookbook/no-code-it-helpdesk-lovable

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- What IT topic should the first suggested question cover? Pick something you know exists in your Glean content.

1. **Resolve your Glean instance**
   Copy the instance slug from your Glean URL, the part in https://<instance>-be.glean.com. That slug is GLEAN_INSTANCE. Plugin users run the command instead and take the same slug from the returned URL.

   ```bash
   node <cookbook-plugin-root>/scripts/resolve-backend.mjs "<work-email>"
   ```

2. **Fill the prompt template**
   Open recipes/no-code-it-helpdesk-lovable/lovable-prompt.md. Replace <your-glean-instance> with the instance slug, and set the first suggested question to a natural question about the supplied topic. Plugin users show the filled prompt and stop. Do not open Lovable.

3. **Paste into a new private Lovable project**
   Start a new private project at https://lovable.dev and paste the filled prompt as the first message. Plugin users hand the filled prompt to the user. Do not open Lovable.

4. **Add secrets when Lovable asks**
   When Lovable asks, add GLEAN_API_TOKEN and GLEAN_INSTANCE as backend secrets, never in the chat. The token is one service identity. Keep the project private.

5. **Verify with two live questions**
   Ask "Where do I reset my SSO password?" and "How do I request a new laptop?" Each should return a cited answer from your own indexed content.
