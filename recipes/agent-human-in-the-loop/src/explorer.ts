import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identifier, parseResponses, record } from '../public/model.js';
import type { AgentRuns } from './agent-runs.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html'],
  '/app.css': ['app.css', 'text/css'],
  '/glean-cookbook.css': ['glean-cookbook.css', 'text/css'],
  '/glean-logomark.svg': ['glean-logomark.svg', 'image/svg+xml'],
  '/build/app.js': ['build/app.js', 'text/javascript'],
  '/build/model.js': ['build/model.js', 'text/javascript'],
};
async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 64 * 1024) throw new Error('Request exceeds the 64 KiB limit.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createExplorerServer(client: AgentRuns, agentId: string) {
  return http.createServer(async (req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(body));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const allowedHosts = [
      `localhost:${req.socket.localPort}`,
      `127.0.0.1:${req.socket.localPort}`,
    ];
    if (!allowedHosts.includes(req.headers.host ?? ''))
      return json(403, { error: 'Local host required.' });
    const origin = `http://${req.headers.host}`;
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      return json(403, { error: 'Same-origin requests only.' });
    }
    const route = req.url ?? '/';
    const asset = assets[route];
    if (req.method === 'GET' && asset) {
      try {
        const data = await readFile(path.join(publicDir, asset[0]));
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        res.end(data);
      } catch {
        json(500, { error: 'Build the browser assets with npm run build.' });
      }
      return;
    }
    // A custom header blocks cross-origin simple requests; no CORS permission is issued.
    if (req.headers['x-cookbook-request'] !== '1')
      return json(403, { error: 'Explorer request header required.' });
    if (req.method === 'GET' && route === '/api/config')
      return json(200, { agentId });
    let call: (() => ReturnType<AgentRuns['get']>) | undefined;
    try {
      if (req.method === 'POST' && route === '/api/runs') {
        if (!req.headers['content-type']?.startsWith('application/json'))
          throw new Error('JSON required.');
        const body = await readBody(req);
        if (!record(body) || typeof body.message !== 'string')
          throw new Error('Supply a message.');
        const message = body.message;
        call = () => client.create(message);
      } else {
        const match =
          /^\/api\/runs\/([A-Za-z0-9_-]{1,256})(?:\/(responses|cancellations))?$/.exec(
            route,
          );
        if (!match || !identifier(match[1]))
          return json(404, { error: 'Route not found.' });
        const runId = match[1];
        if (req.method === 'GET' && !match[2]) call = () => client.get(runId);
        if (req.method === 'POST' && match[2] === 'cancellations')
          call = () => client.cancel(runId);
        if (req.method === 'POST' && match[2] === 'responses') {
          if (!req.headers['content-type']?.startsWith('application/json'))
            throw new Error('JSON required.');
          const body = parseResponses(await readBody(req));
          call = () => client.respond(runId, body);
        }
      }
    } catch {
      return json(400, {
        error:
          'Invalid request. Supply bounded JSON with a message or unique APPROVE/REJECT decisions.',
      });
    }
    if (!call) return json(405, { error: 'Method not allowed.' });
    try {
      // HTTP status from Glean is inside the exchange, distinct from local transport status.
      json(200, await call());
    } catch {
      json(502, {
        error:
          'Authentication or upstream transport failed. Check login and the backend origin. A POST may have been accepted: do not blindly create another run. Retrieve a known run ID before deciding what to retry.',
      });
    }
  });
}
