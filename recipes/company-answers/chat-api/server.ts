import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

// Path B (Chat API): you own the UI, the server owns the API token. Construct
// the client with instance/serverURL, read citations from
// fragment.citation.sourceDocument, and exclude progress messages from answers.
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

  const contentMessages = (response.messages ?? []).filter(
    (message) => message.messageType === 'CONTENT',
  );
  const fragments = contentMessages.flatMap(
    (message) => message.fragments ?? [],
  );

  const answer = fragments.map((fragment) => fragment.text ?? '').join('');

  // Empty answer text means the run did not produce a usable answer. Surface a
  // retryable failure rather than rendering a blank panel.
  if (answer.trim().length === 0) {
    throw new Error(
      'Glean returned no answer text. This happens when a chat run ends while ' +
        'a server tool is still pending; the request succeeded but the answer ' +
        'was never produced. Retrying usually works.',
    );
  }

  const citations = fragments
    .map((fragment) => fragment.citation?.sourceDocument)
    .filter(
      (document): document is NonNullable<typeof document> =>
        !!document?.title && !!document?.url,
    );
  const uniqueCitations = Array.from(
    new Map(citations.map((document) => [document.url, document])).values(),
  );

  return { answer, citations: uniqueCitations };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  const publicAsset =
    req.method === 'GET' &&
    (req.url === '/glean-cookbook.css' || req.url === '/glean-logomark.svg')
      ? req.url.slice(1)
      : null;
  if (publicAsset) {
    res.writeHead(200, {
      'Content-Type': publicAsset.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'image/svg+xml',
    });
    res.end(fs.readFileSync(path.join(publicDir, publicAsset)));
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

const requestedPort = process.env.PORT ? Number(process.env.PORT) : 0;
server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine the local server port.');
  }
  console.log(
    `Company Answers (Chat API) running at http://localhost:${address.port}`,
  );
});
