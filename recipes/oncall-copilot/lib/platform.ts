// Platform API client: Search, Chat, and Agents, with a fixture mode.
//
// API contracts:
//   Search  POST /api/search  -> results[].{title,url,snippets}
//   Chat    POST /rest/api/v1/chat -> messages[] where messageType === 'CONTENT'
//   Agents  POST /api/agents/{agent_id}/runs -> messages[].content[].text
//
// Auth is the caller's own token. There is no impersonation anywhere in this
// recipe; see README for what that does and does not let the approval gate claim.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface Cited {
  text: string;
  citations: Array<{ title: string; url: string }>;
}

export class ChatUnfinishedError extends Error {
  constructor(
    public readonly attempts: number,
    fixtureKey: string,
  ) {
    super(
      `Client Chat returned 200 with no answer text for ${fixtureKey} after ${attempts} attempts.`,
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

interface RawChatResponse {
  messages?: Array<{
    author?: string;
    messageType?: string;
    fragments?: Array<{
      text?: string;
      citation?: { sourceDocument?: { title?: string; url?: string } };
    }>;
  }>;
}

export function parseChat(data: RawChatResponse): Cited {
  // CONTENT messages from GLEAN_AI are the answer; UPDATE messages are progress
  // narration. A trailing empty CONTENT message is normal, so join across all of
  // them rather than reading the last one.
  const fragments = (data.messages ?? [])
    .filter(
      (message) =>
        message.messageType === 'CONTENT' && message.author === 'GLEAN_AI',
    )
    .flatMap((message) => message.fragments ?? []);

  const text = fragments
    .map((fragment) => fragment.text ?? '')
    .join('')
    .trim();

  // Citations hang off individual fragments, not off the message.
  const raw = fragments
    .map((fragment) => fragment.citation?.sourceDocument)
    .filter(
      (document): document is { title?: string; url?: string } =>
        document !== undefined,
    );

  const citations = Array.from(
    new Map(
      raw
        .filter((source) => source.title && source.url)
        .map((source) => [
          source.url as string,
          { title: source.title as string, url: source.url as string },
        ]),
    ).values(),
  );
  return { text, citations };
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

  // Client Chat synthesis.
  const response = await fetch(`${backend()}/rest/api/v1/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      saveChat: false,
      messages: [{ author: 'USER', fragments: [{ text: input }] }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /rest/api/v1/chat returned ${response.status}: ${await response.text()}`,
    );
  }
  const parsed = parseChat((await response.json()) as RawChatResponse);
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
