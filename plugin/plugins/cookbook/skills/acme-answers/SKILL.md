---
name: acme-answers
description: 'The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.'
disable-model-invocation: true
---

Build "Acme Answers", a one-page company Q&A app on Glean, following
https://developers.glean.com/cookbook/acme-answers

1. Ask me which path: (A) Web SDK or (B) Chat API. Build the one I pick.
2. Path A: npm install @gleanwork/web-sdk; create a container with
   position: relative, display: block, width: 100%, height: 480px, then
   renderChat(el, { initialMessage: "What's our PTO policy?" }) — SSO
   auth needs no configuration. Passing initialMessage opens straight
   into a real cited answer instead of an empty landing screen, and
   doubles as your on-load verification.
3. Path B: npm install @gleanwork/api-client; construct the client with
   new Glean({ apiToken, instance }) — NOT `domain`, which is not a
   real SDKOptions field despite appearing in one of the SDK's own
   bundled example files. POST chat.create with my question as a
   single USER message; the response can include earlier step-narration
   messages (search/read progress) ahead of the real answer — filter to
   messageType === 'CONTENT', then join those messages' fragments[].text
   for the answer. Citations live per-fragment at fragments[].citation
   .sourceDocument (title + url) — not a top-level citedDocuments field,
   and not the older message.citations[] field, which is deprecated and
   wasn't populated at all on a live test response. Dedupe citations by
   url since the same source is commonly cited by more than one
   fragment. Keep the API token server-side.
4. Style it as Acme Corp per the house style below: the real logomark
   in the header (not a plain colored square), teal (#0E8C84) as the
   primary accent, "Acme Answers" title.
5. Verify with "What's our PTO policy?" — the answer must carry
   citations and respect my permissions. Contrast note for the
   README: the SDK path ships Glean's full UI free; the API path
   gives total UI control.

## Reference

Chat API: POST /rest/api/v1/chat (client SDK glean.client.chat.create). A real response can include earlier UPDATE-type messages narrating search/read steps ahead of the answer — filter to messageType === 'CONTENT' before joining fragments[].text, or that narration text ends up prepended to the answer. Citations live per-fragment at fragments[].citation.sourceDocument (title, url), not a top-level citedDocuments field and not the older message.citations[] field — that field is deprecated (removal scheduled 2026-10-15) and, verified live, wasn't populated at all on an agentic chat response even though real citations existed. Dedupe citations by url since the same source is commonly cited by more than one fragment. Client constructor takes apiToken + instance (or serverURL), not domain.

## Authentication

This recipe needs `web-sdk-cookie` or `client-api-oauth-or-token` auth — follow the matching subsection under "Authentication: follow the recipe's declared `authMethod`" in the `cookbook-conventions` skill in this plugin, rather than assuming which credential path applies.

## House style

This recipe renders a Web SDK UI — apply the cookbook's shared conventions (see the `cookbook-conventions` skill in this plugin): the real Acme logomark (not a plain colored square), a 480–500px-tall container, and `initialMessage` set to this recipe's own first demo query so it opens into a real answer instead of an empty landing screen.
