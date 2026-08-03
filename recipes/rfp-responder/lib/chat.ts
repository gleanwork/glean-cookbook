// Platform Chat client.
//
// Auth: this recipe runs as the caller. There is no impersonation and no act-as —
// your own OAuth token is the permission boundary, so content you cannot see can
// never reach the prompt, and therefore can never reach the customer's document.
// That property is the recipe, not a caveat.
//
// Contract verified against scio/openapi/public/platform/chat.yaml:
//   POST /api/chat  { input, stream: false, store: true }
//   -> output[].content[] where type === 'output_text'
//      .text and .annotations[].sources[] { title, url }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Citation } from './grounding.ts';

interface PlatformSource {
  type?: string;
  title?: string;
  url?: string;
  snippet?: string;
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
  role?: string;
  content?: PlatformContentBlock[];
}

export interface PlatformChatResponse {
  output?: PlatformOutputMessage[];
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
}

/**
 * Constrains answers to retrieved evidence and to a tone that can be pasted
 * straight into a customer questionnaire. The refusal instruction is the
 * load-bearing line: without it the model will happily answer a compliance
 * question from its own training data.
 */
export function buildInstructions(steering?: string): string {
  const base = [
    'You are drafting a response to a customer security questionnaire.',
    'Use ONLY the retrieved company documents as evidence.',
    'If the retrieved documents do not support an answer, reply exactly: INSUFFICIENT_EVIDENCE.',
    'Never infer a control, certification, or commitment that is not stated in the documents.',
    'Answer in two or three sentences, factual and neutral, ready to paste into the customer document.',
    'Do not address the reader, do not editorialise, do not narrate your reasoning.',
  ];
  if (steering) base.push(`Additional reviewer instruction: ${steering}`);
  return base.join(' ');
}

export const INSUFFICIENT = 'INSUFFICIENT_EVIDENCE';

export function parsePlatformChatResponse(
  data: PlatformChatResponse,
): ChatAnswer {
  const blocks = data.output?.flatMap((message) => message.content ?? []) ?? [];
  const textBlocks = blocks.filter((block) => block.type === 'output_text');

  const answer = textBlocks
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  const raw = textBlocks.flatMap(
    (block) =>
      block.annotations?.flatMap((annotation) => annotation.sources ?? []) ??
      [],
  );

  const citations = Array.from(
    new Map(
      raw
        .filter((source) => source.title && source.url)
        .map((source) => [
          source.url as string,
          {
            title: source.title as string,
            url: source.url as string,
            snippet: source.snippet,
          },
        ]),
    ).values(),
  );

  // A model that refuses has produced no answer, so drop any citations with it —
  // otherwise the row looks grounded in the review grid.
  if (answer.includes(INSUFFICIENT)) return { answer: '', citations: [] };

  return { answer, citations };
}

function fixtureDir(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'fixtures',
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Recorded responses keyed by question id, for offline verification. */
export function loadFixtureResponses(): Record<string, PlatformChatResponse> {
  const file = path.join(fixtureDir(), 'chat-responses.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
    string,
    PlatformChatResponse
  >;
}

export async function askChat(
  questionId: string,
  question: string,
  steering?: string,
): Promise<ChatAnswer> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const fixtures = loadFixtureResponses();
    const recorded = fixtures[questionId];
    if (!recorded) return { answer: '', citations: [] };
    return parsePlatformChatResponse(recorded);
  }

  const instance = requireEnv('GLEAN_INSTANCE');
  const token = requireEnv('GLEAN_API_TOKEN');

  const response = await fetch(`https://${instance}-be.glean.com/api/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GLEAN-INCLUDE-EXPERIMENTAL': 'true',
    },
    body: JSON.stringify({
      input: `${buildInstructions(steering)}\n\nQuestion: ${question}`,
      stream: false,
      store: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST /api/chat returned ${response.status}: ${body}`);
  }

  return parsePlatformChatResponse(
    (await response.json()) as PlatformChatResponse,
  );
}
