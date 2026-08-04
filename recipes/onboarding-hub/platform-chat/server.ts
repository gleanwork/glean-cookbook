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

type MilestoneGroup = 'it' | 'hr' | 'team' | 'engineering';

interface OnboardingStep {
  id: string;
  title: string;
  group: MilestoneGroup;
  initiallyDone: boolean;
  dueDate?: string;
  askPrompt: string;
}

interface ChecklistPayload {
  steps: OnboardingStep[];
  source: 'fixture' | 'config' | 'empty';
}

const GROUPS = new Set<MilestoneGroup>(['it', 'hr', 'team', 'engineering']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const fixturesDir = path.join(__dirname, 'fixtures');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function useFixture(): boolean {
  return process.env.GLEAN_USE_FIXTURE === 'true';
}

function parseSteps(raw: unknown): OnboardingStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: OnboardingStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.askPrompt !== 'string' ||
      typeof row.group !== 'string' ||
      !GROUPS.has(row.group as MilestoneGroup)
    ) {
      continue;
    }
    steps.push({
      id: row.id,
      title: row.title,
      group: row.group as MilestoneGroup,
      initiallyDone: Boolean(row.initiallyDone),
      dueDate: typeof row.dueDate === 'string' ? row.dueDate : undefined,
      askPrompt: row.askPrompt,
    });
  }
  return steps;
}

function loadChecklist(): ChecklistPayload {
  if (useFixture()) {
    const fixturePath = path.join(fixturesDir, 'steps.json');
    return {
      steps: parseSteps(JSON.parse(fs.readFileSync(fixturePath, 'utf8'))),
      source: 'fixture',
    };
  }

  const inline = process.env.GLEAN_ONBOARDING_STEPS_JSON?.trim();
  if (inline) {
    return {
      steps: parseSteps(JSON.parse(inline)),
      source: 'config',
    };
  }

  const stepsFile = process.env.GLEAN_ONBOARDING_STEPS_FILE?.trim();
  if (stepsFile) {
    const resolved = path.isAbsolute(stepsFile)
      ? stepsFile
      : path.join(process.cwd(), stepsFile);
    return {
      steps: parseSteps(JSON.parse(fs.readFileSync(resolved, 'utf8'))),
      source: 'config',
    };
  }

  return { steps: [], source: 'empty' };
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

function loadFixtureChatResponse(input: string): PlatformChatResponse {
  const fixturePath = path.join(fixturesDir, 'chat-responses.json');
  const recorded = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Record<
    string,
    PlatformChatResponse
  >;
  const exact = recorded[input];
  if (exact) return exact;
  const fallback = recorded['What should I do on my first day?'];
  if (!fallback) {
    throw new Error(
      'fixtures/chat-responses.json is missing the day-one entry',
    );
  }
  return fallback;
}

function withEscalate(parsed: {
  answer: string;
  citations: Array<{ title: string; url: string }>;
}): {
  answer: string;
  citations: Array<{ title: string; url: string }>;
  escalate: boolean;
} {
  const escalate = !parsed.answer.trim() || parsed.answer.trim().length < 20;
  return { ...parsed, escalate };
}

async function askPlatformChat(input: string): Promise<{
  answer: string;
  citations: Array<{ title: string; url: string }>;
  escalate: boolean;
}> {
  if (useFixture()) {
    return withEscalate(
      parsePlatformChatResponse(loadFixtureChatResponse(input)),
    );
  }

  // GLEAN_SERVER_URL rather than an instance name: deriving the backend as
  // `https://${instance}-be.glean.com` only holds for the default naming, and
  // silently points at nothing when a deployment differs. The docs use
  // GLEAN_SERVER_URL throughout for the same reason.
  // Auth is the caller's own token — no act-as / impersonation.
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
  if (!parsed.answer.trim()) {
    throw new Error(
      'Glean returned no answer text. This happens when a chat run ends while ' +
        'a server tool is still pending; the request succeeded but the answer ' +
        'was never produced. Retrying usually works.',
    );
  }
  return withEscalate(parsed);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/checklist') {
    try {
      const payload = loadChecklist();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    try {
      const body = await readJsonBody(req);
      const result = await askPlatformChat(body.question);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
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
