import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenLocal } from './lib/cookbook-server.js';
import { askPlatformChat } from './lib/chat.js';
import { loadAccount } from './lib/search.js';

// Path A: Platform Search tiles + Platform Chat synthesis.
// Search: glean.search.query (POST /api/search) — @gleanwork/api-client@0.18.0
// Chat: SDK call to POST /api/chat.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

function validateEnvironment(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    );
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/account') {
    try {
      const payload = await loadAccount();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch (error) {
      const message = (error as Error).message;
      console.error('Account load failed:', message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not load the account.',
          hint: message.startsWith('No fixture recorded')
            ? 'That account query is not in the recorded demo fixtures.'
            : 'Check credentials and that experimental Platform search is enabled.',
        }),
      );
    }
    return;
  }

  if (
    req.method === 'POST' &&
    (req.url === '/api/ask' || req.url === '/api/chat')
  ) {
    try {
      const body = await readJsonBody(req);
      const question = body.question?.trim();
      if (!question) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'question is required' }));
        return;
      }
      const { answer, citations } = await askPlatformChat(question);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer, citations }));
    } catch (error) {
      const message = (error as Error).message;
      console.error('Account chat failed:', message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not answer that question.',
          hint: message.startsWith('No fixture recorded')
            ? 'That question is not in the recorded demo fixtures.'
            : message.startsWith('Glean returned no answer text')
              ? 'Retrying usually works when a chat run ends before the answer is produced.'
              : 'Check credentials and the CHAT scope.',
        }),
      );
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

function readJsonBody(
  req: http.IncomingMessage,
): Promise<{ question?: string }> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

if (process.env.GLEAN_USE_FIXTURE === 'true') {
  validateEnvironment(['GLEAN_ACCOUNT_NAME']);
} else {
  validateEnvironment([
    'GLEAN_API_TOKEN',
    'GLEAN_SERVER_URL',
    'GLEAN_ACCOUNT_NAME',
  ]);
}
listenLocal(server, 'Customer 360 (Platform Search + Chat)');
