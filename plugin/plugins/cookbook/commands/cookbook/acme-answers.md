---
name: acme-answers
description: 'The hello-world of Glean apps: one page, one input, one permission-aware cited answer — built two ways, with the Web SDK and with the Chat API.'
---

Build "Acme Answers", a one-page company Q&A app on Glean, following
https://developers.glean.com/cookbook/acme-answers

1. Ask me which path: (A) Web SDK or (B) Chat API. Build the one I pick.
2. Path A: npm install @gleanwork/web-sdk; render a container and call
   renderChat(el, {}) — SSO auth needs no configuration.
3. Path B: npm install @gleanwork/api-client; construct the client with
   new Glean({ apiToken, instance }) — NOT `domain`, which is not a
   real SDKOptions field despite appearing in one of the SDK's own
   bundled example files. POST chat.create with my question as a
   single USER message; render answer text by joining
   messages[].fragments[].text, and citations from
   messages[].citations[].sourceDocument (title + url) — there is no
   top-level citedDocuments field. Keep the API token server-side.
4. Style it as Acme Corp (teal #0E8C84 accent per the brand kit,
   "Acme Answers" title).
5. Verify with "What's our PTO policy?" — the answer must carry
   citations and respect my permissions. Contrast note for the
   README: the SDK path ships Glean's full UI free; the API path
   gives total UI control.

## Reference

Chat API: POST /rest/api/v1/chat (client SDK glean.client.chat.create). Answer text lives in messages[].fragments[].text (join them); citations live in messages[].citations[].sourceDocument (title, url) — not a top-level citedDocuments field. Client constructor takes apiToken + instance (or serverURL), not domain.
