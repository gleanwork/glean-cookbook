import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';
import { PlatformProblemDetailError } from '@gleanwork/api-client/models/errors';
import type { Citation } from './grounding.ts';

interface CitationSource {
  type?: string;
  document_id?: string;
  title?: string;
  url?: string;
}

interface PlatformChatResponse {
  object?: string;
  status?: string;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        sources?: CitationSource[];
        snippets?: Array<{ text?: string }>;
      }>;
    }>;
  }>;
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  unfinished: boolean;
}

export class ChatUnfinishedError extends Error {
  constructor(questionId: string, attempts: number) {
    super(
      `Platform Chat completed with no answer text for ${questionId} after ${attempts} attempt(s). ` +
        'The run did not finish. This says nothing about the evidence in your corpus.',
    );
    this.name = 'ChatUnfinishedError';
  }
}

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

export function parsePlatformChatResponse(data: unknown): ChatAnswer {
  if (!data || typeof data !== 'object') {
    throw new Error('Platform Chat returned an invalid response.');
  }
  const response = data as PlatformChatResponse;
  if (response.object !== 'RESPONSE' || response.status !== 'COMPLETED') {
    throw new Error('Platform Chat did not return a completed response.');
  }

  const contents = (response.output ?? [])
    .filter(
      (message) => message.type === 'MESSAGE' && message.role === 'ASSISTANT',
    )
    .flatMap((message) => message.content ?? [])
    .filter((content) => content.type === 'OUTPUT_TEXT');
  const textBlocks = contents
    .map((content) => content.text ?? '')
    .filter((text) => text.trim() !== '');
  const answer = textBlocks.join('').trim();

  if (textBlocks.length === 0) {
    return { answer: '', citations: [], unfinished: true };
  }
  if (answer.includes(INSUFFICIENT)) {
    return { answer: '', citations: [], unfinished: false };
  }

  const citations = new Map<string, Citation>();
  for (const annotation of contents.flatMap(
    (content) => content.annotations ?? [],
  )) {
    if (annotation.type !== 'CITATION') continue;
    const snippet = (annotation.snippets ?? [])
      .map((item) => item.text ?? '')
      .filter(Boolean)
      .join(' ')
      .trim();
    for (const source of annotation.sources ?? []) {
      if (
        source.type !== 'DOCUMENT' ||
        !source.title ||
        !source.url ||
        citations.has(source.url)
      ) {
        continue;
      }
      citations.set(source.url, {
        title: source.title,
        url: source.url,
        ...(snippet ? { snippet } : {}),
      });
    }
  }
  return { answer, citations: [...citations.values()], unfinished: false };
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

export function loadFixtureResponses(): Record<string, PlatformChatResponse> {
  const file =
    process.env.RFP_CHAT_FIXTURES ??
    path.join(fixtureDir(), 'chat-responses.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
    string,
    PlatformChatResponse
  >;
}

export const MAX_CHAT_ATTEMPTS = 2;

export async function askChat(
  questionId: string,
  question: string,
  steering?: string,
  attempt = 1,
): Promise<ChatAnswer> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const recorded = loadFixtureResponses()[questionId];
    if (!recorded) return { answer: '', citations: [], unfinished: false };
    const parsed = parsePlatformChatResponse(recorded);
    if (parsed.unfinished) throw new ChatUnfinishedError(questionId, 1);
    return parsed;
  }

  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: requireEnv('GLEAN_SERVER_URL').replace(/\/$/u, ''),
    includeExperimental: true,
  });
  let response: Awaited<ReturnType<typeof glean.chat.create>>;
  try {
    response = await glean.chat.create({
      input: `${buildInstructions(steering)}\n\nQuestion: ${question}`,
      stream: false,
      store: false,
    });
  } catch (error) {
    if (error instanceof PlatformProblemDetailError) {
      throw new Error(
        `POST /api/chat returned ${error.status} (${error.code}), request ${error.request_id}`,
        { cause: error },
      );
    }
    throw error;
  }
  if (typeof response === 'string') {
    throw new Error('Platform Chat returned a stream for a non-stream request.');
  }
  const parsed = parsePlatformChatResponse(response);
  if (!parsed.unfinished) return parsed;
  if (attempt < MAX_CHAT_ATTEMPTS) {
    return askChat(questionId, question, steering, attempt + 1);
  }
  throw new ChatUnfinishedError(questionId, attempt);
}
