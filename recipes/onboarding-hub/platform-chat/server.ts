import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Path B (Platform Chat): you own the UI; the server calls POST /api/chat.
// Verified against the OpenAPI contract in scio/openapi/public/platform/chat.yaml.
// Requires X_GLEAN_INCLUDE_EXPERIMENTAL and a live Platform Chat handler.

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
  source: 'config' | 'empty';
}

const GROUPS = new Set<MilestoneGroup>(['it', 'hr', 'team', 'engineering']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
        .filter(
          (source) =>
            source.title && source.url && isSafeHttpUrl(source.url as string),
        )
        .map((source) => [
          source.url as string,
          { title: source.title as string, url: source.url as string },
        ]),
    ).values(),
  );

  return { answer, citations };
}

function withEscalate(parsed: {
  answer: string;
  citations: Array<{ title: string; url: string }>;
}): {
  answer: string;
  citations: Array<{ title: string; url: string }>;
  escalate: boolean;
} {
  // Empty, thin, or uncited answers must escalate — inventing an onboarding
  // step is worse than routing to HR/IT. Uncited prose is treated the same.
  const escalate =
    !parsed.answer.trim() ||
    parsed.answer.trim().length < 20 ||
    parsed.citations.length === 0;
  return { ...parsed, escalate };
}

async function askPlatformChat(input: string): Promise<{
  answer: string;
  citations: Array<{ title: string; url: string }>;
  escalate: boolean;
}> {
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
  // Empty or uncited completed responses escalate rather than 500: the hub's
  // failure mode for "docs don't cover this" is the escalate affordance.
  return withEscalate(parsePlatformChatResponse(data));
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
