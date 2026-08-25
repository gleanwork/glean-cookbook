---
name: no-code-it-helpdesk-lovable
description: 'Paste a prompt into Lovable to get a private page that answers common IT questions from your Glean docs.'
disable-model-invocation: true
---

## Before you start

- A Lovable account
- A Glean Client API token with the CHAT scope. Create it in Admin Console → API access → Client API tokens, and keep it as a Lovable backend secret. Every request uses that token owner's access
- A private Lovable project. Multi-user deployments require authenticated per-user Glean OAuth

Build "Build an IT helpdesk page in Lovable" following https://developers.glean.com/cookbook/no-code-it-helpdesk-lovable

{{> ask-setup-questions}}

- What is your work email? It is used once to discover your Glean tenant.
- What IT topic do you know your docs cover?

1. **Copy your instance name**
   Copy the instance name from the lookup on this page, or from `https://app.glean.com/admin/about-glean`. For `https://acme-be.glean.com` that value is `acme`, not the full URL and not `app.glean.com`. Cookbook plugin users can run `resolve-backend.mjs` with the work email and use the `instance` field.

2. **Copy the prompt into a private Lovable project**
   Click `Copy Lovable prompt`. Replace `<your-glean-instance>` with your instance name. Paste the result into a new private project at `https://lovable.dev`. Cookbook plugin users: the same text is in `lovable-prompt.md` next to this skill.

3. **Add secrets when Lovable asks**
   When Lovable asks, add `GLEAN_API_TOKEN` and `GLEAN_INSTANCE` as backend secrets, never in the chat. This token is one person's Glean access. Keep the project private.

4. **Ask the two IT questions**
   Ask "Where do I reset my SSO password?" and "How do I request a new laptop?" Each answer should cite a real doc from your own instance.
