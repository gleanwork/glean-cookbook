import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenLocal } from './lib/cookbook-server.js';
import { askPlatformChat, type ConversationTurn } from './lib/chat.js';

// Path B: you own the UI; the server calls Platform Chat and renders the answer
// plus its citations.

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

const SHARED_ASSETS: Record<string, string> = {
  '/glean-cookbook.css': 'text/css; charset=utf-8',
};

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(publicDir, 'index.html')));
    return;
  }

  if (req.method === 'GET' && req.url && SHARED_ASSETS[req.url]) {
    res.writeHead(200, { 'Content-Type': SHARED_ASSETS[req.url] });
    res.end(fs.readFileSync(path.join(publicDir, req.url.slice(1))));
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
      const result = await askPlatformChat(question, parseHistory(body.history));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const message = (error as Error).message;
      console.error('Ask failed:', message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Could not answer that question.',
          hint: message.startsWith('No fixture recorded')
            ? 'That question is not in the recorded demo fixtures.'
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
