import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import open from 'open';
import { listenLocal } from './lib/cookbook-server.js';
import { createApp } from './src/app.js';
import { createGleanClient, loadDotEnv, resolveBackend } from './src/client.js';
import { Session } from './src/session.js';

const { values } = parseArgs({
  options: {
    backend: { type: 'string' },
    email: { type: 'string' },
    'no-open': { type: 'boolean', default: false },
  },
});

loadDotEnv();
const backend = await resolveBackend(values);
const client = createGleanClient(backend);
const sessionKey = randomBytes(18).toString('base64url');
const allowedHosts = new Set<string>();

const handle = createApp({
  backend,
  sessionKey,
  allowedHosts: () => allowedHosts,
  publicDir: path.join(import.meta.dirname, 'public'),
  workDir: path.resolve('.cookbook-runs'),
  session: new Session(backend),
  skillsApi: () => client.skills,
});

const server = http.createServer((req, res) => {
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(
    `http://${req.headers.host ?? 'localhost'}${req.url}`,
    {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([name, value]) =>
        value === undefined
          ? []
          : [
              [name, Array.isArray(value) ? value.join(', ') : value] as [
                string,
                string,
              ],
            ],
      ),
      body: hasBody
        ? (Readable.toWeb(req) as ReadableStream<Uint8Array>)
        : undefined,
      // Node requires duplex for a streamed request body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' },
  );
  handle(request)
    .then(async (response) => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        for await (const chunk of response.body) res.write(chunk);
      }
      res.end();
    })
    .catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});

listenLocal(server, 'Plugin skill importer', () => {
  const address = server.address();
  if (!address || typeof address === 'string') return;
  allowedHosts.add(`localhost:${address.port}`);
  allowedHosts.add(`127.0.0.1:${address.port}`);
  const url = `http://localhost:${address.port}/#session=${sessionKey}`;
  console.log(`Glean backend: ${backend}`);
  console.log(`Open the importer: ${url}`);
  if (!values['no-open']) {
    open(url).catch(() => {
      console.log('Could not open a browser. Open the link above to continue.');
    });
  }
});
