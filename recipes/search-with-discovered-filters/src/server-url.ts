const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const GLEAN_BACKEND_HOST = /^[a-z0-9-]+-be\.glean\.com$/u;

export function parseGleanServerURL(
  value: string,
  options: { allowLoopback?: boolean } = {},
): URL {
  const server = new URL(value);
  const isLoopback = LOOPBACK_HOSTS.has(server.hostname);
  const isRootURL =
    server.pathname === '/' &&
    !server.search &&
    !server.hash &&
    !server.username &&
    !server.password;

  if (
    options.allowLoopback &&
    isLoopback &&
    ['http:', 'https:'].includes(server.protocol) &&
    isRootURL
  ) {
    return server;
  }

  if (
    server.protocol === 'https:' &&
    !server.port &&
    isRootURL &&
    GLEAN_BACKEND_HOST.test(server.hostname)
  ) {
    return server;
  }

  throw new Error('Use a Glean backend URL such as https://acme-be.glean.com.');
}
