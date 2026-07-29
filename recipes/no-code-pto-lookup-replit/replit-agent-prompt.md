# Replit Agent prompt

Paste this whole block into Replit Agent as your first message. Fill in `<your-glean-instance>` before sending — everything else is instructions for the Agent, not for you.

````text
Build "Acme HR Assistant" — a single-page chat tool that answers employee
questions about PTO and benefits using the Glean Chat API. I don't want to
write or review implementation code; you own that. I do want to review the
running app and its use of secrets.

Stack: Node.js + Express backend, plain HTML/CSS/JS frontend (no framework
needed). The backend is the only thing that talks to Glean — the browser
never sees a Glean API token.

1. Scaffold an Express server with one route:
   - GET  /          → serves a static index.html: a text input, a submit
     button, an answer area, and a "Sources" list below the answer.
   - POST /api/ask    → body `{ "question": string }`, calls Glean, returns
     `{ "answer": string, "citations": [{ "title": string, "url": string }] }`.

2. Install `@gleanwork/api-client` (pin the version — do not use a `^` or
   `latest` range) and construct the client like this:

   ```ts
   import { Glean } from '@gleanwork/api-client';

   const glean = new Glean({
     apiToken: process.env.GLEAN_API_TOKEN,
     instance: process.env.GLEAN_INSTANCE, // e.g. "<your-glean-instance>"
   });
   ```

   Both `GLEAN_API_TOKEN` and `GLEAN_INSTANCE` must come from Replit
   Secrets (the padlock icon in the sidebar), never hardcoded and never
   sent to the browser. Stop and ask me for these two values by name
   before running the app — do not invent placeholder values and move on.

3. Call the Chat API like this — the response shape is specific, follow it
   exactly rather than guessing at field names:

   ```ts
   export async function askGlean(question: string) {
     const response = await glean.client.chat.create({
       messages: [{ author: 'USER', fragments: [{ text: question }] }],
     });

     const contentMessages = (response.messages ?? []).filter(
       (m) => m.messageType === 'CONTENT',
     );
     const fragments = contentMessages.flatMap((m) => m.fragments ?? []);

     const answer = fragments.map((f) => f.text ?? '').join('');

     const citations = fragments
       .map((f) => f.citation?.sourceDocument)
       .filter(
         (doc): doc is NonNullable<typeof doc> => !!doc?.title && !!doc?.url,
       );
     const uniqueCitations = Array.from(
       new Map(citations.map((doc) => [doc.url, doc])).values(),
     );

     return { answer, citations: uniqueCitations };
   }
   ```

   Notes on the response shape, since guessing at field names here is
   easy to get wrong:
   - The response can include earlier step-narration messages (search/read
     progress) before the real answer — filter to `messageType === 'CONTENT'`
     or that narration text ends up prepended to the answer.
   - Citations live per-fragment, in `fragment.citation.sourceDocument` —
     not a top-level `citedDocuments` field, and not the older
     `message.citations[]` field (deprecated, and not populated at all on
     a live agentic response). Dedupe by `url` since the same source is
     commonly cited by more than one fragment.

4. Frontend: on submit, POST the question to `/api/ask`, render `answer`
   as text, and render each citation as a link using its `title` and
   `url`. Show a loading state while waiting. Show the raw error message
   if the request fails (this is an internal tool — don't hide errors
   from me while I'm testing it).

5. Style it as Acme Corp: use `#0E8C84` (teal) as the primary accent —
   the submit button, an active/focus state, or a header bar. Use this
   exact mark as the page's logo/icon instead of a generic chat icon —
   inline the SVG directly rather than approximating it:

   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32" role="img" aria-label="Acme Corp">
     <rect x="0" y="0" width="64" height="64" rx="18" fill="#0E8C84"></rect>
     <path fill-rule="evenodd" fill="#ffffff" d="M32 13 L55 52 L9 52 Z M32 29 L43 46 L21 46 Z"></path>
   </svg>
   ```

6. Give the assistant a short system framing so it stays on-topic: it
   should present itself as "Acme HR Assistant" and answer PTO/benefits
   questions using only what Glean returns — don't have it add HR advice
   Glean didn't cite.

7. When you're done, tell me the two things I need to test:
   - Ask "What is our PTO policy?" and confirm the answer cites the PTO
     policy document.
   - Ask something outside HR entirely (e.g. "what's our revenue?") and
     confirm the assistant doesn't fabricate an answer when Glean has
     nothing relevant to cite.

Do not add authentication, a database, or user accounts — Glean already
enforces per-user permissions on the backend token's behalf for this demo,
and this is a single-tenant internal tool.
````
