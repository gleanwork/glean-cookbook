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

export interface ChatMessage {
  author?: string;
  messageType?: string;
  fragments?: ChatFragment[];
}

export interface ChatResponse {
  messages?: ChatMessage[];
}

export interface ConversationTurn {
  author: 'USER' | 'GLEAN_AI';
  text: string;
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

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseClientChatResponse(data: ChatResponse): ChatAnswer {
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

export function buildChatRequest(
  input: string,
  history: ConversationTurn[],
): {
  saveChat: false;
  messages: Array<{
    author: ConversationTurn['author'];
    messageType: 'CONTENT';
    fragments: Array<{ text: string }>;
  }>;
} {
  return {
    saveChat: false,
    messages: [...history, { author: 'USER' as const, text: input }].map(
      (message) => ({
        author: message.author,
        messageType: 'CONTENT' as const,
        fragments: [{ text: message.text }],
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

export function loadFixtureResponses(): Record<string, ChatResponse> {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir(), 'chat-responses.json'), 'utf8'),
  ) as Record<string, ChatResponse>;
}

export async function askClientChat(
  input: string,
  history: ConversationTurn[],
  attempt = 1,
): Promise<ChatAnswer & { escalate: boolean }> {
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    const recorded = loadFixtureResponses()[input];
    if (!recorded) {
      throw new Error(`No fixture recorded for question: ${input}`);
    }
    const parsed = parseClientChatResponse(recorded);
    if (!parsed.answer) {
      throw new Error(
        'Glean returned no answer text after two attempts. Check the server logs and try again.',
      );
    }
    return withEscalate(parsed);
  }

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
    body: JSON.stringify(buildChatRequest(input, history)),
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
