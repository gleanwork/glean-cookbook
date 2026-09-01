import type {
  PlatformChatCompletedResponse,
  PlatformChatOutputMessage,
} from '@gleanwork/api-client/models/components';
import { CreateAcceptEnum } from '@gleanwork/api-client/funcs/chatCreate.js';
import {
  createGleanClient,
  createResponseBodyCapture,
  type GleanClientTarget,
} from './client.js';
import { parseSseData, readSseEvents } from './sse.js';

type JsonRecord = Record<string, unknown>;

export interface ChatOptions extends GleanClientTarget {
  followUp?: string;
  prompt: string;
  stream: boolean;
}

interface ChatTurn {
  conversationId?: string;
  text: string;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null
    ? (value as JsonRecord)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function extractOutputText(messages: PlatformChatOutputMessage[]) {
  return messages
    .flatMap((message) => message.content)
    .map((content) => content.text)
    .join('');
}

function printCitations(response: PlatformChatCompletedResponse) {
  const citations = response.output.flatMap((message) =>
    message.content.flatMap((content) => content.annotations ?? []),
  );
  if (citations.length === 0) return;

  console.log('\nSources:');
  for (const [index, citation] of citations.entries()) {
    for (const source of citation.sources) {
      const title =
        'title' in source && typeof source.title === 'string'
          ? source.title
          : undefined;
      const url =
        'url' in source && typeof source.url === 'string'
          ? source.url
          : undefined;
      console.log(`  ${index + 1}. ${title ?? url ?? source.type}`);
      if (url) console.log(`     ${url}`);
    }
    for (const snippet of citation.snippets ?? []) {
      console.log(`     ${snippet.text}`);
    }
  }
}

function findCompletedResponse(
  value: unknown,
): PlatformChatCompletedResponse | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (
    Array.isArray(record.output) &&
    typeof record.id === 'string' &&
    typeof record.request_id === 'string'
  ) {
    return record as PlatformChatCompletedResponse;
  }

  for (const nested of [record.response, record.data]) {
    const response = findCompletedResponse(nested);
    if (response) return response;
  }
  return undefined;
}

function findConversationId(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.conversation_id === 'string') return record.conversation_id;
  for (const nested of [record.response, record.data]) {
    const conversationId = findConversationId(nested);
    if (conversationId) return conversationId;
  }
  return undefined;
}

function extractStreamText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return stringValue(value) ?? '';

  const delta = stringValue(record.delta);
  if (delta) return delta;

  const text = stringValue(record.text);
  if (text) return text;

  const responseText = extractStreamText(record.response);
  if (responseText) return responseText;

  if (Array.isArray(record.output)) {
    const messages = record.output.filter(
      (message): message is PlatformChatOutputMessage => {
        const candidate = asRecord(message);
        return (
          !!candidate &&
          Array.isArray(candidate.content) &&
          candidate.content.every((content) => {
            const item = asRecord(content);
            return !!item && typeof item.text === 'string';
          })
        );
      },
    );
    if (messages.length > 0) return extractOutputText(messages);
  }

  return '';
}

async function createTurn(
  target: GleanClientTarget,
  input: string,
  conversationId?: string,
): Promise<ChatTurn> {
  const client = await createGleanClient(target);
  const response = await client.chat.create({
    conversation_id: conversationId,
    input,
    store: true,
  });
  if (typeof response === 'string') {
    throw new Error(
      'Expected a JSON Chat response. Remove stream mode for this turn.',
    );
  }

  const text = extractOutputText(response.output);
  console.log(text || 'No answer text returned.');
  printCitations(response);
  return { conversationId: response.conversation_id ?? undefined, text };
}

async function streamTurn(
  target: GleanClientTarget,
  input: string,
  conversationId?: string,
): Promise<ChatTurn> {
  const capture = createResponseBodyCapture();
  const client = await createGleanClient(target, capture);
  const responsePromise = client.chat.create(
    {
      conversation_id: conversationId,
      input,
      store: true,
      stream: true,
    },
    { acceptHeaderOverride: CreateAcceptEnum.textEventStream },
  );
  void responsePromise.catch((error: unknown) => capture.reject(error));

  const stream = await capture.waitForStream();
  let text = '';
  let lastEvent: unknown;
  for await (const event of readSseEvents(stream)) {
    const payload = parseSseData<JsonRecord>(event);
    if (!payload) continue;
    lastEvent = payload;

    const nextText = extractStreamText(payload);
    const delta = nextText.startsWith(text)
      ? nextText.slice(text.length)
      : nextText;
    if (delta) {
      process.stdout.write(delta);
      text += delta;
    }
  }

  const response = await responsePromise;
  if (typeof response !== 'string') {
    lastEvent = response;
    if (!text) text = extractOutputText(response.output);
  }
  process.stdout.write('\n');

  const completed = findCompletedResponse(lastEvent);
  if (completed) printCitations(completed);
  return {
    conversationId: completed?.conversation_id ?? findConversationId(lastEvent),
    text,
  };
}

export async function runChat({
  email,
  followUp,
  prompt,
  serverUrl,
  stream,
}: ChatOptions) {
  const target = { email, serverUrl };
  const firstTurn = stream
    ? await streamTurn(target, prompt)
    : await createTurn(target, prompt);

  if (!followUp) return;
  if (!firstTurn.conversationId) {
    throw new Error(
      'The first turn did not return a conversation_id; cannot continue the conversation.',
    );
  }

  console.log('\nFollow-up:');
  if (stream) {
    await streamTurn(target, followUp, firstTurn.conversationId);
  } else {
    await createTurn(target, followUp, firstTurn.conversationId);
  }
}
