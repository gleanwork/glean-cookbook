## Problem

Every team has the same first Glean app: a single page where anyone can ask
a company question and get a cited, permission-aware answer. There are two
equally valid ways to build it — this recipe builds both, side by side, so
you can pick the trade-off that fits your app.

## Take it further

- Swap in a specific agent by passing its `agentId` — to the chat component for
  Path A, or in the `chat.create` request for Path B.
- Stream responses instead of waiting for the full answer (both the Web SDK and
  the Chat API support streaming).
- Add follow-up prompt suggestions from the Chat API response's
  `followUpPrompts`.
