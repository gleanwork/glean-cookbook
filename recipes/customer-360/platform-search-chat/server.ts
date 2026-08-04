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
    // Nullable on purpose: on the live path these are only populated when a
    // retrieved document supports them, and a blank KPI is truthful where an
    // assumed one is not. The fixture path fills them all in.
    owner: string | null;
    arr: string | null;
    renewalDate: string | null;
    risk: string | null;
    seats: string | null;
    kpiNote: string;
  };
  tiles: Tile[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const fixturesDir = path.join(__dirname, 'fixtures');

// The account name is the reader's, so the tile queries are built from it. An
// earlier version searched for a fixed demo account, which returns nothing on any
// instance but the one it was written against.
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

// Only the name is known up front. Every other field stays null unless a
// retrieved document supports it: an unsourced figure on a page about a named
// customer is the worst output this app can produce, and a blank field is a
// truthful one. The fixture path supplies a fully populated account so the layout
// is still reviewable offline.
function unpopulatedAccount(account: string) {
  return {
    name: account,
    owner: null,
    arr: null,
    renewalDate: null,
    risk: null,
    seats: null,
    kpiNote:
      'Fields stay blank until a cited document supports them. Populate them from ' +
      'your own retrieval rather than assuming a shape.',
  };
}

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

  const backend = requireEnv('GLEAN_SERVER_URL').replace(/\/$/, '');
  const token = requireEnv('GLEAN_API_TOKEN');

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
  const parsed = parsePlatformChatResponse(data);
  // Platform Chat can return HTTP 200 with the run unfinished (empty
  // output_text, trailing tool activity, no error field). Treat that as
  // failure so the UI does not render a blank "success".
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
  if (useFixture()) {
    return JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'account.json'), 'utf8'),
    ) as AccountPayload;
  }

  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL ??= 'true';
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: requireEnv('GLEAN_SERVER_URL'),
  });

  const account = accountName();
  const tiles = await Promise.all(
    tileQueries(account).map((tile) => searchTile(glean, tile)),
  );

  return { account: unpopulatedAccount(account), tiles };
}

function frameAccountPrompt(question: string): string {
  // Name the account, and nothing else. An earlier version asserted a persona and a
  // company, which invites the model to answer about them rather than about whatever
  // the reader's own content says.
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
      // Frame lazily: the framing names the account, which is only configured for
      // live runs, so building it eagerly makes fixture mode require live env.
      const { answer, citations } = await askPlatformChat(
        useFixture() ? question : frameAccountPrompt(question),
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
