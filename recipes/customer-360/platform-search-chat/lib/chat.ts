import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ChatCitationDocument {
  title?: string;
  url?: string;
}

export interface ChatFragment {
  text?: string;
  citation?: { sourceDocument?: ChatCitationDocument };
}

export interface ChatMessageEnvelope {
  author?: string;
  messageType?: string;
  fragments?: ChatFragment[];
}

export interface ClientChatResponse {
  messages?: ChatMessageEnvelope[];
}

export interface ChatAnswer {
  answer: string;
  citations: Array<{ title: string; url: string }>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function accountName(): string {
  return requireEnv('GLEAN_ACCOUNT_NAME');
}

export function frameAccountPrompt(question: string): string {
  // Name the account without inventing a persona or company identity.
  return (
    `Answer about the ${accountName()} account using only this company's own ` +
    `indexed knowledge. Cite every claim. If the sources do not cover it, say so ` +
    `rather than inferring. Question: ${question}`
  );
}

export function parseClientChatResponse(data: ClientChatResponse): ChatAnswer {
  // CONTENT messages from GLEAN_AI are the answer; UPDATE messages are progress
  // narration. A trailing empty CONTENT message is normal, so join across all of
  // them rather than reading the last one.
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
        .filter((source) => source.title && source.url)
        .map((source) => [
          source.url as string,
          { title: source.title as string, url: source.url as string },
        ]),
    ).values(),
  );

  return { answer, citations };
}

export function buildChatRequest(text: string): {
  saveChat: false;
  messages: Array<{ author: 'USER'; fragments: Array<{ text: string }> }>;
} {
  return {
    saveChat: false,
    messages: [{ author: 'USER', fragments: [{ text }] }],
  };
}

function fixtureDir(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'fixtures',
  );
}

export function loadFixtureResponses(): Record<string, ClientChatResponse> {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir(), 'chat-responses.json'), 'utf8'),
  ) as Record<string, ClientChatResponse>;
}

export async function askClientChat(question: string): Promise<ChatAnswer> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const recorded = loadFixtureResponses()[question];
    if (!recorded) {
      throw new Error(`No fixture recorded for question: ${question}`);
    }
    const parsed = parseClientChatResponse(recorded);
    if (!parsed.answer.trim()) {
      throw new Error(
        'Glean returned no answer text. This happens when a chat run ends while ' +
          'a server tool is still pending; the request succeeded but the answer ' +
          'was never produced. Retrying usually works.',
      );
    }
    return parsed;
  }

  const backend = requireEnv('GLEAN_SERVER_URL').replace(/\/$/, '');
  const token = requireEnv('GLEAN_API_TOKEN');

  const response = await fetch(`${backend}/rest/api/v1/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildChatRequest(frameAccountPrompt(question))),
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

  const data = (await response.json()) as ClientChatResponse;
  const parsed = parseClientChatResponse(data);
  // Empty answer text is a transport failure, not a blank success.
  if (!parsed.answer.trim()) {
    throw new Error(
      'Glean returned no answer text. This happens when a chat run ends while ' +
        'a server tool is still pending; the request succeeded but the answer ' +
        'was never produced. Retrying usually works.',
    );
  }
  return parsed;
}
