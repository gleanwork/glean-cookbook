import { renderChat } from '@gleanwork/web-sdk';

// Path A (Web SDK): Glean owns the UI. renderChat needs zero required
// options — every field on ChatOptions is optional (verified against the
// pinned @gleanwork/web-sdk@2.4.0 types). Setting `backend` is recommended
// in production so users aren't asked for their email to route to your
// instance; omitted here since the recipe has no real instance to point at.
const container = document.getElementById('chat');

if (!container) {
  throw new Error('Missing #chat container element');
}

renderChat(container, {
  // backend: 'https://{your}-be.glean.com',
});
