import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

// Path A: Platform Search tiles + Platform Chat synthesis.
// Search: glean.search.query (POST /api/search) — @gleanwork/api-client@0.18.0
// Chat: fetch POST /api/chat until glean.chat.create ships (same Onboarding contract).

interface PlatformSource {
  type?: string;
  title?: string;
  url?: string;
}

interface PlatformAnnotation {
  type?: string;
  sources?: PlatformSource[];
}

interface PlatformContentBlock {
  type?: string;
  text?: string;
  annotations?: PlatformAnnotation[];
}

interface PlatformOutputMessage {
  type?: string;
  content?: PlatformContentBlock[];
}

interface PlatformChatResponse {
  output?: PlatformOutputMessage[];
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
    owner: string;
    arr: string;
    renewalDate: string;
    risk: string;
    seats: string;
    kpiNote: string;
  };
  tiles: Tile[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const fixturesDir = path.join(__dirname, 'fixtures');

const TILE_QUERIES: Array<{ id: string; label: string; query: string }> = [
  {
    id: 'account-notes',
    label: 'Account notes',
    query: 'Globex account notes ARR seats contacts',
  },
  {
    id: 'renewal',
    label: 'Renewal status',
    query: 'Globex renewal status Q3 2026',
  },
  {
    id: 'security',
    label: 'Security questionnaire',
    query: 'Globex security questionnaire',
  },
];

const SEEDED_ACCOUNT = {
  name: 'Globex',
  owner: 'Sam Reyes',
  arr: '$840,000',
  renewalDate: '2026-09-30',
  risk: 'low',
  seats: '1,200',
  kpiNote:
    'Demo KPIs grounded in sales-globex-account-notes + sales-globex-renewal-status',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function useFixture(): boolean {
  return process.env.GLEAN_USE_FIXTURE === 'true';
}

function parsePlatformChatResponse(data: PlatformChatResponse): {
  answer: string;
  citations: Array<{ title: string; url: string }>;
} {
  const blocks = data.output?.flatMap((message) => message.content ?? []) ?? [];
  const textBlocks = blocks.filter((block) => block.type === 'output_text');
  const answer = textBlocks
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  const rawCitations = textBlocks.flatMap(
    (block) =>
      block.annotations?.flatMap((annotation) => annotation.sources ?? []) ??
      [],
  );
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

function loadChatFixture(input: string): PlatformChatResponse {
  const all = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, 'chat-responses.json'), 'utf8'),
  ) as Record<string, PlatformChatResponse>;
  return all[input] ?? all._default;
}

async function askPlatformChat(input: string): Promise<{
  answer: string;
  citations: Array<{ title: string; url: string }>;
}> {
  if (useFixture()) {
    return parsePlatformChatResponse(loadChatFixture(input));
  }

  const instance = requireEnv('GLEAN_INSTANCE');
  const token = requireEnv('GLEAN_API_TOKEN');
  const backend = `https://${instance}-be.glean.com`;

  const response = await fetch(`${backend}/api/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GLEAN-INCLUDE-EXPERIMENTAL': 'true',
    },
    body: JSON.stringify({ input, stream: false, store: true }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST /api/chat returned ${response.status}: ${body}`);
  }

  const data = (await response.json()) as PlatformChatResponse;
  return parsePlatformChatResponse(data);
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
  if (useFixture()) {
    return JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'account.json'), 'utf8'),
    ) as AccountPayload;
  }

  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL ??= 'true';
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    instance: requireEnv('GLEAN_INSTANCE'),
  });

  const tiles = await Promise.all(
    TILE_QUERIES.map((tile) => searchTile(glean, tile)),
  );

  return { account: SEEDED_ACCOUNT, tiles };
}

function frameAccountPrompt(question: string): string {
  return (
    `You are helping Sam Reyes prepare for the Globex account. ` +
    `Answer using only Acme sales knowledge about Globex. ` +
    `Cite sources. Question: ${question}`
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
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const body = await readJsonBody(req);
      const question = body.question?.trim();
      if (!question) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'question is required' }));
        return;
      }
      const framed = frameAccountPrompt(question);
      const { answer, citations } = await askPlatformChat(
        useFixture() ? question : framed,
      );
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

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(
    `Customer 360 (Platform Search + Chat) running at http://localhost:${port}`,
  );
});
