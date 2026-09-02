import type {
  PlatformChatCompletedResponse,
  PlatformChatOutputMessage,
} from '@gleanwork/api-client/models/components';
import { createGleanClient, type GleanClientTarget } from './client.js';

export interface ChatOptions extends GleanClientTarget {
  followUp?: string;
  prompt: string;
  stream: boolean;
}

interface ChatTurn {
  conversationId?: string;
  text: string;
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
  const client = await createGleanClient(target);
  const stream = await client.chat.createStream({
    conversation_id: conversationId,
    input,
    store: true,
  });

  let text = '';
  let completed: PlatformChatCompletedResponse | undefined;
  for await (const event of stream) {
    switch (event.event) {
      case 'RESPONSE_OUTPUT_TEXT_DELTA':
        process.stdout.write(event.data.delta);
        text += event.data.delta;
        break;
      case 'RESPONSE_COMPLETED':
        completed = event.data.response;
        break;
      case 'RESPONSE_FAILED':
        throw new Error(event.data.response.error.message);
      case 'RESPONSE_CREATED':
      case 'RESPONSE_PROGRESS':
      case 'RESPONSE_OUTPUT_TEXT_DONE':
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
      }
    }
  }
  process.stdout.write('\n');

  if (completed) printCitations(completed);
  return {
    conversationId: completed?.conversation_id ?? undefined,
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
