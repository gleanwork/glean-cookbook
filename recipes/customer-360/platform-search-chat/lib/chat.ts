import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';
import { PlatformProblemDetailError } from '@gleanwork/api-client/models/errors';

interface CitationSource {
  type?: string;
  document_id?: string;
  person_id?: string;
  file_id?: string;
  entity_id?: string;
  title?: string;
  name?: string;
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
      }>;
    }>;
  }>;
}

export interface ChatCitation {
  title: string;
  url?: string;
}

export interface ChatAnswer {
  answer: string;
  citations: ChatCitation[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function accountName(): string {
  return requireEnv('GLEAN_ACCOUNT_NAME');
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sourceTitle(source: CitationSource): string | undefined {
  return (
    source.title ??
    source.name ??
    source.document_id ??
    source.person_id ??
    source.file_id ??
    source.entity_id
  );
}

export function frameAccountPrompt(question: string): string {
  return (
    `Answer about the ${accountName()} account using only this company's own ` +
    `indexed knowledge. Cite every claim. If the sources do not cover it, say so ` +
    `rather than inferring. Question: ${question}`
  );
}

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
  const answer = contents
    .map((content) => content.text ?? '')
    .join('')
    .trim();

  const citationsByKey = new Map<string, ChatCitation>();
  for (const annotation of contents.flatMap(
    (content) => content.annotations ?? [],
  )) {
    if (annotation.type !== 'CITATION') continue;
    for (const source of annotation.sources ?? []) {
      const title = sourceTitle(source);
      if (!title) continue;
      const url =
        source.url && isSafeHttpUrl(source.url) ? source.url : undefined;
      const key =
        url ??
        source.document_id ??
        source.person_id ??
        source.file_id ??
        source.entity_id;
      if (key && !citationsByKey.has(key)) {
        citationsByKey.set(key, { title, ...(url ? { url } : {}) });
      }
    }
  }
  return { answer, citations: [...citationsByKey.values()] };
}

export function buildPlatformChatRequest(input: string): {
  input: string;
  stream: false;
  store: false;
} {
  return { input, stream: false, store: false };
}

function fixtureDir(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'fixtures',
  );
}

export function loadFixtureResponses(): Record<string, PlatformChatResponse> {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir(), 'chat-responses.json'), 'utf8'),
  ) as Record<string, PlatformChatResponse>;
}

function requireAnswer(parsed: ChatAnswer): ChatAnswer {
  if (!parsed.answer.trim()) {
    throw new Error(
      'Glean returned no answer text. The request completed without a usable output. Retrying usually works.',
    );
  }
  return parsed;
}

export async function askPlatformChat(question: string): Promise<ChatAnswer> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const recorded = loadFixtureResponses()[question];
    if (!recorded) {
      throw new Error(`No fixture recorded for question: ${question}`);
    }
    return requireAnswer(parsePlatformChatResponse(recorded));
  }

  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: requireEnv('GLEAN_SERVER_URL').replace(/\/$/, ''),
    includeExperimental: true,
  });
  let response: Awaited<ReturnType<typeof glean.chat.create>>;
  try {
    response = await glean.chat.create(
      buildPlatformChatRequest(frameAccountPrompt(question)),
    );
  } catch (error) {
    if (error instanceof PlatformProblemDetailError) {
      console.error(
        `POST /api/chat returned ${error.status} (${error.code}), request ${error.request_id}`,
      );
    }
    throw new Error(
      'Chat request failed. Check that your token carries the CHAT scope and that experimental APIs are enabled.',
      { cause: error },
    );
  }
  if (typeof response === 'string') {
    throw new Error(
      'Platform Chat returned a stream for a non-stream request.',
    );
  }
  return requireAnswer(parsePlatformChatResponse(response));
}
