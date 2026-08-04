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
    serverURL: requireEnv('GLEAN_SERVER_URL'),
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
    `Produce a QBR-ready account brief section for the ${accountName()} ` +
    `account. Use only this company's own indexed knowledge. Cite every claim ` +
    `with markdown links to the documents you used. If the sources do not cover ` +
    `something, say so rather than inferring it. `;

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

  const parsed = parseAgentResponse(result);
  if (!parsed.answer.trim()) {
    throw new Error(
      'Glean returned no agent answer text. The run may have finished without ' +
        'a GLEAN_AI message; retrying usually works.',
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

  const glean = createGlean();
  const account = accountName();
  const tiles = await Promise.all(
    tileQueries(account).map((tile) => searchTile(glean, tile)),
  );
  return { account: unpopulatedAccount(account), tiles };
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
      res.end(JSON.stringify({ ...payload, fixtureMode: useFixture() }));
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
