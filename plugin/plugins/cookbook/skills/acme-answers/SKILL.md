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
   single USER message; render answer text by joining
   messages[].fragments[].text, and citations from
   messages[].citations[].sourceDocument (title + url) — there is no
   top-level citedDocuments field. Keep the API token server-side.
4. Style it as Acme Corp per the house style below: the real logomark
   in the header (not a plain colored square), teal (#0E8C84) as the
   primary accent, "Acme Answers" title.
5. Verify with "What's our PTO policy?" — the answer must carry
   citations and respect my permissions. Contrast note for the
   README: the SDK path ships Glean's full UI free; the API path
   gives total UI control.

## Reference

Chat API: POST /rest/api/v1/chat (client SDK glean.client.chat.create). Answer text lives in messages[].fragments[].text (join them); citations live in messages[].citations[].sourceDocument (title, url) — not a top-level citedDocuments field. Client constructor takes apiToken + instance (or serverURL), not domain.

## House style

This recipe renders a Web SDK UI — apply the cookbook's shared conventions (see the `cookbook-conventions` skill in this plugin): the real Acme logomark (not a plain colored square), a 480–500px-tall container, and `initialMessage` set to this recipe's own first demo query so it opens into a real answer instead of an empty landing screen.
