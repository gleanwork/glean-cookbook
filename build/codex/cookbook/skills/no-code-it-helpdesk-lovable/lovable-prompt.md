# Lovable prompt

Paste this whole block into Lovable as your first message. Fill in `<your-glean-instance>` and `<topic>` before sending. Everything else is instructions for the Agent, not for you.

````text
Build "IT Deflection Page", a single-page chat tool that answers
common IT helpdesk questions (SSO/password resets, laptop issues, VPN
setup) using the Glean Chat API, so employees get an answer before they
file a ticket. I don't want to write or review implementation code; you
own that. I do want to review the running app and its use of secrets.

The browser must never see a Glean API token. If a question calls a
Glean API from the client, the token is exposed to anyone who opens
devtools, and that's not acceptable here. Route the Glean call through
whatever server-side mechanism you use for secrets and backend calls.
You may need to connect a backend/database integration to get one.
Ask me before you do, and ask me for the two values below when it's
ready. Don't skip this by calling Glean directly from React.

1. Build a polished React assistant called "IT Help." On desktop, use a
   compact two-column workspace: a short "Ask before you file a ticket"
   intro with three suggested questions on the left, and the assistant on
   the right. The three questions are "How do I get help with <topic>?",
   "How do I reset my SSO password?", and "How do I request a new laptop?"
   Keep the assistant, its composer, and the latest answer above
   the fold. On mobile, put the assistant first. The assistant is a real
   thread: append user and assistant messages, keep the composer pinned,
   auto-scroll inside the thread, and show citations as compact source chips
   directly under each answer.

2. Server-side, install `@gleanwork/api-client` (pin the version; do
   not use a `^` or `latest` range) and construct the client like this:

   ```ts
   import { Glean } from '@gleanwork/api-client';

   const glean = new Glean({
     apiToken: process.env.GLEAN_API_TOKEN,
     instance: process.env.GLEAN_INSTANCE, // e.g. "<your-glean-instance>"
   });
   ```

   Both `GLEAN_API_TOKEN` and `GLEAN_INSTANCE` must be stored as
   server-side secrets, never hardcoded and never bundled into the
   frontend. Stop and ask me for these two values by name before running
   the app. Do not invent placeholder values and move on.

3. Call the Chat API like this. The response shape is specific, follow
   it exactly rather than guessing at field names:

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
     progress) before the real answer. Filter to `messageType === 'CONTENT'`
     or that narration text ends up prepended to the answer.
   - Citations live per-fragment, in `fragment.citation.sourceDocument`,
     not a top-level `citedDocuments` field, and not the
     `message.citations[]` field, which is deprecated and not populated
     on a live agentic response. Dedupe by `url` since the same source is
     commonly cited by more than one fragment.

4. Frontend: on submit, call your server-side function with the question,
   append the response to the thread, and render each citation as a safe
   link using its `title` and `url`. Show a visible loading message, disable
   duplicate submits, keep the thread scrolled to the newest message, and
   show an inline retryable error if the request fails.

5. Style it like the Glean cookbook demos: light gray `#f7f8fa` page,
   white cards with subtle `#e7e8ed` borders, 16px radii, restrained shadows,
   Inter/system sans, strong typographic hierarchy, and `#343ced` as the
   primary accent. Avoid a generic chatbot bubble, oversized hero, gradients
   behind text, and a separate answer box below the form. Use this
   exact mark as the page's logo/icon instead of a generic chat icon.
   Inline the SVG directly rather than approximating it:

   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none" role="img" aria-label="Glean">
     <path d="M24.3006 2.95427L20.7656 0.199951L17.9028 3.99527C13.5653 1.93495 8.23019 3.08439 5.19394 7.00983C1.65888 11.5642 2.483 18.1138 7.03738 21.6489C8.77238 22.9935 10.7893 23.7092 12.8279 23.8177C16.1461 24.0128 19.5077 22.6248 21.6765 19.8055C24.7344 15.88 24.5175 10.4148 21.4596 6.72789L24.3006 2.95427ZM18.1197 17.0512C16.1028 19.632 12.3725 20.1091 9.77001 18.0922C7.18919 16.0752 6.71207 12.3233 8.72901 9.74246C9.70494 8.48458 11.1146 7.68214 12.6761 7.48696C13.0448 7.44358 13.4135 7.4219 13.7822 7.44358C14.975 7.50865 16.1244 7.94239 17.0787 8.67977C19.6595 10.7184 20.1366 14.4703 18.1197 17.0512Z" fill="#4718F2"></path>
     <path d="M24.5176 21.6922C23.932 22.4513 23.2814 23.1236 22.5657 23.7525C21.8717 24.3381 21.1127 24.8803 20.3102 25.3357C19.5295 25.7695 18.6837 26.1382 17.8378 26.4201C16.992 26.702 16.1028 26.8972 15.2137 27.0057C14.3245 27.1141 13.4353 27.1575 12.5244 27.0924C11.6135 27.0273 10.7243 26.8755 9.85684 26.6587L9.66165 27.3743L8.77246 30.9962C9.90021 31.2998 11.0497 31.4733 12.2208 31.56C12.2642 31.56 12.3292 31.56 12.3726 31.56C13.5003 31.6251 14.6498 31.5817 15.7558 31.4516C16.927 31.2998 18.0981 31.0395 19.2258 30.6708C20.3536 30.3022 21.4597 29.825 22.5007 29.2395C23.5634 28.6539 24.561 27.9382 25.4935 27.1575C26.4478 26.355 27.3153 25.4442 28.0744 24.4465C28.1828 24.3164 28.2695 24.1646 28.378 24.0128L24.7779 21.3452C24.6694 21.4537 24.6044 21.5838 24.5176 21.6922Z" fill="#4718F2"></path>
   </svg>
   ```

6. Give the assistant a short system framing so it stays on-topic: it
   should present itself as "IT Help" and answer IT/helpdesk
   questions using only what Glean returns. Don't have it improvise
   troubleshooting steps Glean didn't cite.

7. When you're done, tell me the two things I need to test:
   - Ask "Where do I reset my SSO password?" and confirm the answer
     cites a source from my own indexed content.
   - Ask "How do I request a new laptop?" and confirm the answer
     cites a source from my own indexed content.

This is a private, single-user prototype. The backend token is one service
identity: every request has the token owner's Glean access, not the person
opening the page. Keep the project private and do not deploy or share it. If
I ask for a multi-user deployment, stop and require app authentication plus
a per-user Glean OAuth token; never represent a shared token as per-user
permission enforcement. Do not add a ticketing integration.
````
