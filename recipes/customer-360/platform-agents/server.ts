import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

// Path B: Platform Agents createRun for prescriptive account briefs.
// Tiles: glean.search.query (same as Path A) — keeps the 360 layout.
// Synthesis: glean.agents.createRun(..., agentId) with stream: false (sync wait).

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

interface AgentMessageContent {
  text?: string;
  type?: string;
}

interface AgentMessage {
  role?: string;
  content?: AgentMessageContent[];
}

interface AgentWaitResponse {
  request_id?: string;
  messages?: AgentMessage[];
  run?: { status?: string };
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

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseAgentResponse(data: AgentWaitResponse): {
  answer: string;
  citations: Array<{ title: string; url: string }>;
} {
  const text = (data.messages ?? [])
    .filter((message) => message.role === 'GLEAN_AI')
    .flatMap((message) => message.content ?? [])
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  const citations: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  const addCitation = (title: string, url: string) => {
    if (!isHttpUrl(url) || seen.has(url)) return;
    seen.add(url);
    citations.push({ title: title.trim() || url, url });
  };

  // Preferred: markdown links the Account Brief prompt asks for.
  const markdown = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdown.exec(text)) !== null) {
    addCitation(match[1], match[2]);
  }

  // Fallback: bare http(s) URLs (live agents often omit markdown).
  if (citations.length === 0) {
    const bare = /https?:\/\/[^\s)\]>"']+/g;
    while ((match = bare.exec(text)) !== null) {
      const url = match[0].replace(/[.,;:]+$/, '');
      addCitation(url, url);
    }
  }

  return { answer: text, citations };
}

function loadAgentFixture(input: string): AgentWaitResponse {
  const all = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, 'agent-responses.json'), 'utf8'),
  ) as Record<string, AgentWaitResponse>;
  return all[input] ?? all._default;
}

function createGlean(): Glean {
  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL ??= 'true';
  return new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    instance: requireEnv('GLEAN_INSTANCE'),
  });
}

async function runAgent(question: string): Promise<{
  answer: string;
  citations: Array<{ title: string; url: string }>;
}> {
  if (useFixture()) {
    return parseAgentResponse(loadAgentFixture(question));
  }

  const agentId = requireEnv('GLEAN_AGENT_ID');
  const glean = createGlean();
  const prompt =
    `Produce a QBR-ready account brief section for Globex. ` +
    `Use only Acme sales knowledge. Cite every claim with markdown ` +
    `links like [Document title](https://portal.acme.internal/...). ` +
    `Question: ${question}`;

  const result = await glean.agents.createRun(
    {
      messages: [
        {
          role: 'USER',
          content: [{ text: prompt, type: 'text' }],
        },
      ],
      stream: false,
    },
    agentId,
  );

  if (typeof result === 'string') {
    throw new Error(
      'createRun returned SSE string — call with stream: false for wait response',
    );
  }

  return parseAgentResponse(result);
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

  const glean = createGlean();
  const tiles = await Promise.all(
    TILE_QUERIES.map((tile) => searchTile(glean, tile)),
  );
  return { account: SEEDED_ACCOUNT, tiles };
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

  if (req.method === 'POST' && req.url === '/api/brief') {
    try {
      const body = await readJsonBody(req);
      const question = body.question?.trim();
      if (!question) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'question is required' }));
        return;
      }
      const { answer, citations } = await runAgent(question);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer, citations }));
    } catch (error) {
      const message = (error as Error).message;
      const status =
        /Missing required environment variable: GLEAN_AGENT_ID|404|403|unauthorized|not found/i.test(
          message,
        )
          ? 502
          : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: message,
          hint:
            status === 502
              ? 'Set GLEAN_AGENT_ID to an Account Brief agent you can access, or use GLEAN_USE_FIXTURE=true.'
              : undefined,
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

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(
    `Customer 360 (Platform Agents) running at http://localhost:${port}`,
  );
});
