import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDemoProvider } from './lib/demo.mjs';
import { configuredLiveProvider } from './lib/live.mjs';
import { ApiError } from './lib/contracts.mjs';

const assets = {
  '/': ['public/index.html', 'text/html'],
  '/app.mjs': ['public/app.mjs', 'text/javascript'],
  '/styles.css': ['public/styles.css', 'text/css'],
  '/contracts.mjs': ['lib/contracts.mjs', 'text/javascript'],
};
export function createServer({
  provider = createDemoProvider(),
  brand = 'Northstar',
  workspace = 'Sample workspace',
} = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      const port = server.address()?.port;
      const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (
        !allowed.has(req.headers.host) ||
        (req.headers.origin &&
          ![...allowed]
            .map((h) => `http://${h}`)
            .includes(req.headers.origin)) ||
        req.headers['sec-fetch-site'] === 'cross-site'
      )
        throw new ApiError(
          'This local recipe accepts same-origin loopback requests only.',
          403,
          'forbidden_origin',
        );
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && assets[url.pathname]) {
        const [path, type] = assets[url.pathname];
        const content = await readFile(new URL(path, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(content);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/capabilities') {
        reply(200, {
          mode: provider.mode,
          writes: provider.writes,
          brand,
          workspace,
          limitations: [
            'Department and group writes are not in the P0 limit contract.',
            'Model selectors filter reporting, not limit policies.',
            'Org-chart relationships are directory metadata, not an IdP-group mapping.',
          ],
        });
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/catalog/')) {
        reply(
          200,
          await provider.catalog(
            url.pathname.split('/').at(-1),
            url.searchParams.get('cursor') ?? undefined,
          ),
        );
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/limits') {
        reply(200, await provider.limits());
        return;
      }
      if (
        req.method !== 'POST' ||
        !['/api/usage/search', '/api/usage/evaluate', '/api/limits'].includes(
          url.pathname,
        )
      )
        throw new ApiError('Not found.', 404, 'not_found');
      if (
        !req.headers['content-type']?.startsWith('application/json') ||
        req.headers['x-recipe-request'] !== '1'
      )
        throw new ApiError(
          'Use the same-origin JSON client.',
          403,
          'forbidden_origin',
        );
      req.setEncoding('utf8');
      let input = '';
      for await (const chunk of req) {
        input += chunk;
        if (Buffer.byteLength(input) > 65536)
          throw new ApiError(
            'Request body exceeds 64 KiB.',
            413,
            'request_too_large',
          );
      }
      let body;
      try {
        body = JSON.parse(input);
      } catch {
        throw new ApiError('Invalid JSON.');
      }
      const operation = {
        '/api/usage/search': 'search',
        '/api/usage/evaluate': 'evaluate',
        '/api/limits': 'save',
      }[url.pathname];
      reply(200, await provider[operation](body));
    } catch (error) {
      const known = error instanceof ApiError;
      reply(known ? error.status : 500, {
        message: known
          ? error.message
          : 'Unexpected server error. No credentials or upstream bodies are exposed.',
        code: known ? error.code : 'internal_error',
        ...(known && error.requestId ? { request_id: error.requestId } : {}),
      });
    }
  });
  return server;
}
export async function startDashboard({
  live = process.argv.includes('--live'),
  env = process.env,
} = {}) {
  const provider = live
    ? await configuredLiveProvider(env)
    : createDemoProvider();
  const port = Number(env.PORT ?? '3217');
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be 0–65535 (0 selects an available port).');
  const server = createServer({
    provider,
    brand: env.DASHBOARD_BRAND ?? 'Northstar',
    workspace:
      env.DASHBOARD_WORKSPACE ??
      (live ? 'Connected workspace' : 'Sample workspace'),
  });
  const listen = (chosen) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(chosen, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  try {
    await listen(port);
  } catch (error) {
    if (error.code !== 'EADDRINUSE' || env.PORT !== undefined) throw error;
    await listen(0);
  }
  console.log(
    `Local URL: http://127.0.0.1:${server.address().port} · ${provider.mode} · ${provider.writes ? 'writes enabled' : 'read-only'}`,
  );
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await startDashboard();
