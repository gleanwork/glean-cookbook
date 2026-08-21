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

interface CitationAnnotation {
  type?: string;
  sources?: CitationSource[];
}

interface OutputContent {
  type?: string;
  text?: string;
  annotations?: CitationAnnotation[];
}

interface OutputMessage {
  type?: string;
  role?: string;
  content?: OutputContent[];
}

export interface PlatformChatResponse {
  object?: string;
  status?: string;
  output?: OutputMessage[];
}

export interface ConversationTurn {
  author: 'USER' | 'ASSISTANT';
  text: string;
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

export function withEscalate(parsed: ChatAnswer): ChatAnswer & {
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

export function buildPlatformChatRequest(
  input: string,
  history: ConversationTurn[],
): {
  stream: false;
  store: false;
  input: Array<{
    role: 'USER' | 'ASSISTANT';
    content: string;
  }>;
} {
  return {
    stream: false,
    store: false,
    input: [...history, { author: 'USER' as const, text: input }].map(
      (message) => ({
        role: message.author,
        content: message.text,
      }),
    ),
  };
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

export async function askPlatformChat(
  input: string,
  history: ConversationTurn[],
  attempt = 1,
): Promise<ChatAnswer & { escalate: boolean }> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const recorded = loadFixtureResponses()[input];
    if (!recorded) {
      throw new Error(`No fixture recorded for question: ${input}`);
    }
    const parsed = parsePlatformChatResponse(recorded);
    if (!parsed.answer) {
      throw new Error(
        'Glean returned no answer text after two attempts. Check the server logs and try again.',
      );
    }
    return withEscalate(parsed);
  }

  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: requireEnv('GLEAN_SERVER_URL').replace(/\/$/, ''),
    includeExperimental: true,
  });

  let response: Awaited<ReturnType<typeof glean.chat.create>>;
  try {
    response = await glean.chat.create(
      buildPlatformChatRequest(input, history),
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
  const parsed = parsePlatformChatResponse(response);
  if (!parsed.answer) {
    if (attempt < 2) return askPlatformChat(input, history, attempt + 1);
    throw new Error(
      'Glean returned no answer text after two attempts. Check the server logs and try again.',
    );
  }
  return withEscalate(parsed);
}
