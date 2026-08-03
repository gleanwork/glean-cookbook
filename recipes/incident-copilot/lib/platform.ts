// Platform API client: Search, Chat, and Agents, with a fixture mode.
//
// Contracts verified against the OpenAPI specs and SDK 0.18.0, matching the
// conventions the other Platform recipes already use:
//   Search  POST /api/search  -> results[].{title,url,snippets}
//   Chat    POST /api/chat    -> output[].content[] where type === 'output_text'
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
  return `https://${requireEnv('GLEAN_INSTANCE')}-be.glean.com`;
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

  const response = await fetch(`${backend()}/api/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, pageSize: 10 }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/search returned ${response.status}: ${await response.text()}`,
    );
  }
  return parseSearch((await response.json()) as RawSearchResponse);
}

interface RawChatResponse {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        sources?: Array<{ title?: string; url?: string }>;
      }>;
    }>;
  }>;
}

export function parseChat(data: RawChatResponse): Cited {
  const blocks = data.output?.flatMap((message) => message.content ?? []) ?? [];
  const textBlocks = blocks.filter((block) => block.type === 'output_text');
  const text = textBlocks
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
          { title: source.title as string, url: source.url as string },
        ]),
    ).values(),
  );
  return { text, citations };
}

export async function chat(input: string, fixtureKey: string): Promise<Cited> {
  if (useFixture()) {
    const all = readFixture<Record<string, RawChatResponse>>(
      'chat-responses.json',
    );
    return parseChat(all[fixtureKey] ?? {});
  }

  const response = await fetch(`${backend()}/api/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input, stream: false, store: true }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/chat returned ${response.status}: ${await response.text()}`,
    );
  }
  return parseChat((await response.json()) as RawChatResponse);
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
