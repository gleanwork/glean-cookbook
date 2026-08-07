import { renderChat } from '@gleanwork/web-sdk';

const container = document.getElementById('chat');

if (!container) {
  throw new Error('Missing #chat container element');
}
const chatContainer = container;

function showConfigurationError(message: string): void {
  const paragraph = document.createElement('p');
  paragraph.className = 'config-error';
  paragraph.textContent = message;
  chatContainer.replaceChildren(paragraph);
}

function loadBackend(): string {
  const configured = import.meta.env.VITE_GLEAN_BACKEND?.trim();
  if (!configured) {
    throw new Error(
      'Set VITE_GLEAN_BACKEND in .env.local, then restart the dev server.',
    );
  }

  let backend: URL;
  try {
    backend = new URL(configured);
  } catch {
    throw new Error(
      'VITE_GLEAN_BACKEND must be an absolute URL such as https://example-be.glean.com.',
    );
  }
  if (
    backend.protocol !== 'https:' ||
    backend.username ||
    backend.password ||
    backend.pathname !== '/' ||
    backend.search ||
    backend.hash
  ) {
    throw new Error(
      'VITE_GLEAN_BACKEND must be an HTTPS origin with no path, query, or credentials.',
    );
  }
  return backend.origin;
}

try {
  const initialMessage = import.meta.env.VITE_GLEAN_INITIAL_MESSAGE?.trim();
  renderChat(chatContainer, {
    backend: loadBackend(),
    ...(initialMessage ? { initialMessage } : {}),
  });
} catch (error) {
  showConfigurationError(
    error instanceof Error ? error.message : 'Invalid Glean configuration.',
  );
}
