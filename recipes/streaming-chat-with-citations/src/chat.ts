import type { PlatformChatCompletedResponse } from '@gleanwork/api-client/models/components';
import { createGleanClient, type GleanClientTarget } from './client.js';
import { streamTurn } from './stream.js';

export interface ChatOptions extends GleanClientTarget {
  followUp?: string;
  prompt: string;
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

export async function runChat({
  email,
  followUp,
  prompt,
  serverUrl,
}: ChatOptions) {
  const client = await createGleanClient({ email, serverUrl });
  const firstTurn = await streamTurn(client, prompt);
  if (firstTurn.completed) printCitations(firstTurn.completed);

  if (!followUp) return;
  if (!firstTurn.conversationId) {
    throw new Error(
      'The first turn did not return a conversation_id; cannot continue the conversation.',
    );
  }

  console.log('\nFollow-up:');
  const followUpTurn = await streamTurn(
    client,
    followUp,
    firstTurn.conversationId,
  );
  if (followUpTurn.completed) printCitations(followUpTurn.completed);
}
