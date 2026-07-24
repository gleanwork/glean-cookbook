import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

// Path B (Chat API): you own the UI, the server owns the API token.
// Verified against the pinned @gleanwork/api-client@0.18.0 types — two
// corrections from a first-draft reading of the API:
//   1. The client constructor takes `instance` (or a full `serverURL`),
//      not `domain` — `domain` isn't a real SDKOptions field even though
//      it appears in one of the package's own bundled example files.
//   2. Citations are NOT a top-level `citedDocuments` field on the
//      response. They live per-message, in `message.citations[]`, each
//      with a `sourceDocument` carrying `title`/`url`.
const glean = new Glean({
  apiToken: requireEnv('GLEAN_API_TOKEN'),
  instance: requireEnv('GLEAN_INSTANCE'),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function askGlean(question: string) {
  const response = await glean.client.chat.create({
    messages: [
      {
        author: 'USER',
        fragments: [{ text: question }],
      },
    ],
  });

  const messages = response.messages ?? [];

  const answer = messages
    .flatMap((message) => message.fragments ?? [])
    .map((fragment) => fragment.text ?? '')
    .join('');

  const citations = messages
    .flatMap((message) => message.citations ?? [])
    .map((citation) => citation.sourceDocument)
    .filter((document) => document?.title && document?.url);

  return { answer, citations };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    try {
      const body = await readJsonBody(req);
      const { answer, citations } = await askGlean(body.question);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer, citations }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

function readJsonBody(
  req: http.IncomingMessage,
): Promise<{ question: string }> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Acme Answers (Chat API) running at http://localhost:${port}`);
});
