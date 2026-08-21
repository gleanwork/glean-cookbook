// Platform API client: Search, Chat, and Agents, with a fixture mode.
//
// API contracts:
//   Search  POST /api/search  -> results[].{title,url,snippets}
//   Chat    POST /api/chat -> output[].content[] where type === 'OUTPUT_TEXT'
//   Agents  POST /api/agents/{agent_id}/runs -> messages[].content[].text
//
// Auth is the caller's own token. There is no impersonation anywhere in this
// recipe; see README for what that does and does not let the approval gate claim.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';
import { PlatformProblemDetailError } from '@gleanwork/api-client/models/errors';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface Cited {
  text: string;
  citations: Array<{ title: string; url?: string }>;
}

export class ChatUnfinishedError extends Error {
  constructor(
    public readonly attempts: number,
    fixtureKey: string,
  ) {
    super(
      `Platform Chat completed with no answer text for ${fixtureKey} after ${attempts} attempts.`,
    );
    this.name = 'ChatUnfinishedError';
  }
}

const fixtureDir = () =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function useFixture(): boolean {
  return process.env.GLEAN_USE_FIXTURE === 'true';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function backend(): string {
  // GLEAN_SERVER_URL rather than an instance name: deriving the backend as
  // `https://${instance}-be.glean.com` only holds for the default naming and
  // silently points at nothing when a deployment differs. The dev site docs use
  // GLEAN_SERVER_URL throughout for the same reason.
  return requireEnv('GLEAN_SERVER_URL').replace(/\/$/u, '');
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv('GLEAN_API_TOKEN')}`,
    'Content-Type': 'application/json',
    'X-GLEAN-INCLUDE-EXPERIMENTAL': 'true',
  };
}

function readFixture<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir(), name), 'utf8'),
  ) as T;
}

interface RawSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    snippets?: Array<{ snippet?: string; text?: string }>;
  }>;
}

function parseSearch(data: RawSearchResponse): SearchHit[] {
  return (data.results ?? [])
    .filter((result) => result.title && result.url)
    .map((result) => ({
      title: result.title as string,
      url: result.url as string,
      snippet: (result.snippets ?? [])
        .map((s) => s.snippet ?? s.text ?? '')
        .join(' ')
        .trim(),
    }));
}

/** Fixture search is keyed by query so each fan-out leg gets its own recording. */
export async function search(query: string): Promise<SearchHit[]> {
  if (useFixture()) {
    const all = readFixture<Record<string, RawSearchResponse>>(
      'search-responses.json',
    );
    return parseSearch(all[query] ?? {});
  }

  // `query` only: /api/search rejects unknown properties outright, and it has no
  // page-size parameter -- pageSize, maxResults and limit all return
  // 400 invalid_request. It returns 10 results, which is what this needs anyway.
  const response = await fetch(`${backend()}/api/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/search returned ${response.status}: ${await response.text()}`,
    );
  }
  return parseSearch((await response.json()) as RawSearchResponse);
}

interface CitationSource {
  document_id?: string;
  person_id?: string;
  file_id?: string;
  entity_id?: string;
  title?: string;
  name?: string;
  url?: string;
}

interface RawChatResponse {
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

export function parseChat(data: unknown): Cited {
  if (!data || typeof data !== 'object') {
    throw new Error('Platform Chat returned an invalid response.');
  }
  const response = data as RawChatResponse;
  if (response.object !== 'RESPONSE' || response.status !== 'COMPLETED') {
    throw new Error('Platform Chat did not return a completed response.');
  }

  const contents = (response.output ?? [])
    .filter(
      (message) => message.type === 'MESSAGE' && message.role === 'ASSISTANT',
    )
    .flatMap((message) => message.content ?? [])
    .filter((content) => content.type === 'OUTPUT_TEXT');

  const text = contents
    .map((content) => content.text ?? '')
    .join('')
    .trim();

  const citations = new Map<string, { title: string; url?: string }>();
  for (const annotation of contents.flatMap(
    (content) => content.annotations ?? [],
  )) {
    if (annotation.type !== 'CITATION') continue;
    for (const source of annotation.sources ?? []) {
      const title = sourceTitle(source);
      if (!title) continue;
      const key =
        source.url ??
        source.document_id ??
        source.person_id ??
        source.file_id ??
        source.entity_id;
      if (key && !citations.has(key)) {
        citations.set(key, {
          title,
          ...(source.url ? { url: source.url } : {}),
        });
      }
    }
  }
  return { text, citations: [...citations.values()] };
}

export async function chat(
  input: string,
  fixtureKey: string,
  attempt = 1,
): Promise<Cited> {
  if (useFixture()) {
    const all = readFixture<Record<string, RawChatResponse>>(
      'chat-responses.json',
    );
    return parseChat(all[fixtureKey] ?? {});
  }

  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: backend(),
    includeExperimental: true,
  });
  let response: Awaited<ReturnType<typeof glean.chat.create>>;
  try {
    response = await glean.chat.create({
      input,
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
    throw new Error(
      'Platform Chat returned a stream for a non-stream request.',
    );
  }
  const parsed = parseChat(response);
  if (parsed.text) return parsed;
  if (attempt < 2) return chat(input, fixtureKey, attempt + 1);
  throw new ChatUnfinishedError(attempt, fixtureKey);
}

interface RawAgentRunResponse {
  messages?: Array<{
    role?: string;
    content?: Array<{ text?: string }>;
  }>;
}

/** Agents path: the run engine owns planning; we wait synchronously. */
export async function runAgent(
  agentId: string,
  text: string,
  fixtureKey: string,
): Promise<string> {
  if (useFixture()) {
    const all = readFixture<Record<string, RawAgentRunResponse>>(
      'agent-responses.json',
    );
    const data = all[fixtureKey] ?? {};
    return (data.messages ?? [])
      .flatMap((message) => message.content ?? [])
      .map((content) => content.text ?? '')
      .join('\n')
      .trim();
  }

  const response = await fetch(`${backend()}/api/agents/${agentId}/runs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      messages: [{ role: 'USER', content: [{ text, type: 'text' }] }],
      stream: false,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/agents/${agentId}/runs returned ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as RawAgentRunResponse;
  return (data.messages ?? [])
    .flatMap((message) => message.content ?? [])
    .map((content) => content.text ?? '')
    .join('\n')
    .trim();
}
