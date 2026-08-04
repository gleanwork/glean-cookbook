import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Path B (Platform Chat): you own the UI; the server calls POST /api/chat.
// Verified against the OpenAPI contract in scio/openapi/public/platform/chat.yaml.
// The handler may still be a stub on some instances — set GLEAN_USE_FIXTURE=true
// for contract-only verification, or call live with X_GLEAN_INCLUDE_EXPERIMENTAL.

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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

async function askPlatformChat(input: string): Promise<{
  answer: string;
  citations: Array<{ title: string; url: string }>;
}> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures',
      'chat-response.json',
    );
    const fixture = JSON.parse(
      fs.readFileSync(fixturePath, 'utf8'),
    ) as PlatformChatResponse;
    return parsePlatformChatResponse(fixture);
  }

  // GLEAN_SERVER_URL rather than an instance name: deriving the backend as
  // `https://${instance}-be.glean.com` only holds for the default naming, and
  // silently points at nothing when a deployment differs. The docs use
  // GLEAN_SERVER_URL throughout for the same reason.
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
  return parsePlatformChatResponse(data);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    try {
      const body = await readJsonBody(req);
      const { answer, citations } = await askPlatformChat(body.question);
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
  console.log(
    `Onboarding Hub (Platform Chat) running at http://localhost:${port}`,
  );
});
