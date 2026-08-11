import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenLocal } from './lib/cookbook-server.js';

// Path B: you own the UI; the server calls Client Chat and renders the answer
// plus its citations.

interface ChatCitationDocument {
  title?: string;
  url?: string;
}

interface ChatFragment {
  text?: string;
  citation?: { sourceDocument?: ChatCitationDocument };
}

interface ChatMessage {
  author?: string;
  messageType?: string;
  fragments?: ChatFragment[];
}

interface ChatResponse {
  messages?: ChatMessage[];
}

interface ConversationTurn {
  author: 'USER' | 'GLEAN_AI';
  text: string;
}

const MAX_CONVERSATION_TURNS = 10;
const MAX_TURN_CHARS = 8_000;

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

function parseClientChatResponse(data: ChatResponse): {
  answer: string;
  citations: Array<{ title: string; url: string }>;
} {
  // The answer is the CONTENT messages from GLEAN_AI. The UPDATE messages are
  // progress narration ("Searching company knowledge") and must not be treated
  // as the answer. A trailing empty CONTENT message is normal, so take the text
  // of all of them rather than the last one.
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

async function askClientChat(
  input: string,
  history: ConversationTurn[],
  attempt = 1,
): Promise<{
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

  const response = await fetch(`${backend}/rest/api/v1/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      saveChat: false,
      messages: [...history, { author: 'USER' as const, text: input }].map(
        (message) => ({
          author: message.author,
          messageType: 'CONTENT',
          fragments: [{ text: message.text }],
        }),
      ),
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

  const parsed = parseClientChatResponse(
    (await response.json()) as ChatResponse,
  );
  if (!parsed.answer) {
    if (attempt < 2) return askClientChat(input, history, attempt + 1);
    throw new Error(
      'Glean returned no answer text after two attempts. Check the server logs and try again.',
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
      console.error('Checklist load failed:', (error as Error).message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not load the onboarding checklist.',
          hint: 'Check GLEAN_ONBOARDING_STEPS_JSON / GLEAN_ONBOARDING_STEPS_FILE for valid JSON.',
        }),
      );
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    try {
      const body = await readJsonBody(req);
      const question = body.question?.trim();
      if (!question) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'question is required' }));
        return;
      }
      const result = await askClientChat(question, parseHistory(body.history));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const message = (error as Error).message;
      console.error('Ask failed:', message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not answer that question.',
          hint: 'Check credentials and the CHAT scope.',
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
): Promise<{ question?: string; history?: unknown }> {
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

function parseHistory(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_CONVERSATION_TURNS)
    .filter(
      (turn): turn is ConversationTurn =>
        Boolean(turn) &&
        typeof turn === 'object' &&
        ((turn as ConversationTurn).author === 'USER' ||
          (turn as ConversationTurn).author === 'GLEAN_AI') &&
        typeof (turn as ConversationTurn).text === 'string',
    )
    .map((turn) => ({
      author: turn.author,
      text: turn.text.trim().slice(0, MAX_TURN_CHARS),
    }))
    .filter((turn) => turn.text.length > 0);
}

listenLocal(server, 'Onboarding Hub (Client Chat)');
