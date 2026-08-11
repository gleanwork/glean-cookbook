import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

// Path A: Platform Search tiles + Client Chat synthesis.
// Search: glean.search.query (POST /api/search) — @gleanwork/api-client@0.18.0
// Chat: fetch POST /rest/api/v1/chat.

interface ChatCitationDocument {
  title?: string;
  url?: string;
}

interface ChatFragment {
  text?: string;
  citation?: { sourceDocument?: ChatCitationDocument };
}

interface ChatMessageEnvelope {
  author?: string;
  messageType?: string;
  fragments?: ChatFragment[];
}

interface ClientChatResponse {
  messages?: ChatMessageEnvelope[];
}

interface SearchHit {
  title: string;
  url: string;
  snippets: string[];
}

interface Tile {
  id: string;
  label: string;
  query: string;
  results: SearchHit[];
  empty?: boolean;
}

interface AccountPayload {
  account: {
    name: string;
  };
  tiles: Tile[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

// Build every query from the account selected for this instance.
function accountName(): string {
  return requireEnv('GLEAN_ACCOUNT_NAME');
}

function tileQueries(account: string): Array<{
  id: string;
  label: string;
  query: string;
}> {
  return [
    {
      id: 'account-notes',
      label: 'Account notes',
      query: `${account} account notes ARR seats contacts`,
    },
    {
      id: 'renewal',
      label: 'Renewal status',
      query: `${account} renewal status`,
    },
    {
      id: 'security',
      label: 'Security questionnaire',
      query: `${account} security questionnaire`,
    },
  ];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validateEnvironment(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    );
  }
}

function parseClientChatResponse(data: ClientChatResponse): {
  answer: string;
  citations: Array<{ title: string; url: string }>;
} {
  // CONTENT messages from GLEAN_AI are the answer; UPDATE messages are progress
  // narration. A trailing empty CONTENT message is normal, so join across all of
  // them rather than reading the last one.
  const fragments = (data.messages ?? [])
    .filter(
      (message) =>
        message.messageType === 'CONTENT' && message.author === 'GLEAN_AI',
    )
    .flatMap((message) => message.fragments ?? []);

  const answer = fragments
    .map((fragment) => fragment.text ?? '')
    .join('')
    .trim();

  // Citations hang off individual fragments, not off the message.
  const rawCitations = fragments
    .map((fragment) => fragment.citation?.sourceDocument)
    .filter((document): document is ChatCitationDocument => Boolean(document));
  const citations = Array.from(
    new Map(
      rawCitations
        .filter((source) => source.title && source.url)
        .map((source) => [
          source.url as string,
          { title: source.title as string, url: source.url as string },
        ]),
    ).values(),
  );

  return { answer, citations };
}

async function askClientChat(input: string): Promise<{
  answer: string;
  citations: Array<{ title: string; url: string }>;
}> {
  const backend = requireEnv('GLEAN_SERVER_URL').replace(/\/$/, '');
  const token = requireEnv('GLEAN_API_TOKEN');

  const response = await fetch(`${backend}/rest/api/v1/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      saveChat: false,
      messages: [{ author: 'USER', fragments: [{ text: input }] }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `POST /rest/api/v1/chat returned ${response.status}: ${body}`,
    );
    throw new Error(
      `Chat request failed (${response.status}). Check that your token carries the CHAT scope.`,
    );
  }

  const data = (await response.json()) as ClientChatResponse;
  const parsed = parseClientChatResponse(data);
  // Empty answer text is a transport failure, not a blank success.
  if (!parsed.answer.trim()) {
    throw new Error(
      'Glean returned no answer text. This happens when a chat run ends while ' +
        'a server tool is still pending; the request succeeded but the answer ' +
        'was never produced. Retrying usually works.',
    );
  }
  return parsed;
}

async function searchTile(
  glean: Glean,
  tile: { id: string; label: string; query: string },
): Promise<Tile> {
  const response = await glean.search.query({
    query: tile.query,
    page_size: 3,
  });

  const results: SearchHit[] = [];
  for (const result of response.results ?? []) {
    if (!result.title || !result.url) continue;
    results.push({
      title: result.title,
      url: result.url,
      snippets: (result.snippets ?? []).filter(Boolean),
    });
  }

  return {
    ...tile,
    results,
    empty: results.length === 0,
  };
}

async function loadAccount(): Promise<AccountPayload> {
  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL ??= 'true';
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: requireEnv('GLEAN_SERVER_URL'),
  });

  const account = accountName();
  const tiles = await Promise.all(
    tileQueries(account).map((tile) => searchTile(glean, tile)),
  );

  return { account: { name: account }, tiles };
}

function frameAccountPrompt(question: string): string {
  // Name the account without inventing a persona or company identity.
  return (
    `Answer about the ${accountName()} account using only this company's own ` +
    `indexed knowledge. Cite every claim. If the sources do not cover it, say so ` +
    `rather than inferring. Question: ${question}`
  );
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
      console.error('Account load failed:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not load the account.',
          hint: 'Check credentials and that experimental Platform search is enabled.',
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
      const { answer, citations } = await askClientChat(
        frameAccountPrompt(question),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer, citations }));
    } catch (error) {
      const message = (error as Error).message;
      console.error('Account chat failed:', message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not answer that question.',
          hint: message.startsWith('Glean returned no answer text')
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

const requestedPort = process.env.PORT ? Number(process.env.PORT) : 0;
validateEnvironment([
  'GLEAN_API_TOKEN',
  'GLEAN_SERVER_URL',
  'GLEAN_ACCOUNT_NAME',
]);
server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine the local server port.');
  }
  console.log(
    `Customer 360 (Platform Search + Chat) running at http://localhost:${address.port}`,
  );
});
