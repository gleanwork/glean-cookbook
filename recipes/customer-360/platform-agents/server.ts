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
  const agentId = requireEnv('GLEAN_AGENT_ID');
  const glean = createGlean();
  const prompt =
    `Produce a QBR-ready account brief section for the ${accountName()} ` +
    `account. Use only this company's own indexed knowledge. Cite every claim ` +
    `with markdown links to the documents you used. If the sources do not cover ` +
    `something, say so rather than inferring it. Question: ${question}`;

  let result;
  try {
    result = await glean.agents.createRun(
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
  } catch (error) {
    // The API reports only a field count, which gives no hint that the agent is
    // form-triggered rather than conversational.
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes('invalid user input fields')) {
      throw new Error(
        `Agent ${agentId} is form-triggered: it declares required input ` +
          'fields, so it rejects the conversational messages run this recipe ' +
          'sends. List its field names with glean.agents.getSchemas and pass ' +
          'them as an input object — see the README.',
      );
    }
    throw error;
  }

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
  const glean = createGlean();
  const account = accountName();
  const tiles = await Promise.all(
    tileQueries(account).map((tile) => searchTile(glean, tile)),
  );
  return { account: { name: account }, tiles };
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
    (req.url === '/api/ask' || req.url === '/api/brief')
  ) {
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
      const missingAgent =
        /Missing required environment variable: GLEAN_AGENT_ID|404|not found/i.test(
          message,
        );
      const unauthorized =
        /401|403|insufficient_permissions|unauthorized/i.test(message);
      const emptyAnswer = message.startsWith(
        'Glean returned no agent answer text',
      );
      const status = missingAgent || unauthorized ? 502 : 500;
      console.error('Account brief failed:', message);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: missingAgent
            ? 'Account Brief agent is missing or unavailable.'
            : unauthorized
              ? 'Not authorized to run this agent.'
              : 'Could not generate the account brief.',
          hint: missingAgent
            ? 'Set GLEAN_AGENT_ID to an Account Brief agent you can access.'
            : unauthorized
              ? 'Token needs SEARCH + AGENTS scopes.'
              : emptyAnswer
                ? 'Retrying usually works when a run finishes without an answer.'
                : 'Check credentials, GLEAN_AGENT_ID, and that the agent is available.',
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
  'GLEAN_AGENT_ID',
]);
server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine the local server port.');
  }
  console.log(
    `Customer 360 (Platform Agents) running at http://localhost:${address.port}`,
  );
});
