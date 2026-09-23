import type { PlatformChatCompletedResponse } from '@gleanwork/api-client/models/components';
import { createGleanClient, type GleanClientTarget } from './client.js';
import { createMarkdownOutput, type OutputFormat } from './output.js';
import { streamTurn } from './stream.js';

interface OutputTarget {
  columns?: number;
  isTTY?: boolean;
  write(chunk: string): unknown;
}

export interface ChatOptions extends GleanClientTarget {
  followUp?: string;
  format: OutputFormat;
  prompt: string;
}

function printCitations(
  response: PlatformChatCompletedResponse,
  output: ReturnType<typeof createMarkdownOutput>,
) {
  const citations = response.output.flatMap((message) =>
    message.content.flatMap((content) => content.annotations ?? []),
  );
  if (citations.length === 0) return;

  let text = '\nSources:\n';
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
      text += `  ${index + 1}. ${title ?? url ?? source.type}\n`;
      if (url) text += `     ${url}\n`;
    }
    for (const snippet of citation.snippets ?? []) {
      text += `     ${snippet.text}\n`;
    }
  }
  output.plain(text);
}

export async function runChat(
  { email, followUp, format, prompt, serverUrl }: ChatOptions,
  target: OutputTarget = process.stdout,
) {
  const client = await createGleanClient({ email, serverUrl });
  const output = createMarkdownOutput(format, target);
  const firstStream = output.stream();
  const firstTurn = await streamTurn(client, prompt, undefined, (delta) =>
    firstStream.delta(delta),
  );
  firstStream.complete();
  if (firstTurn.completed) printCitations(firstTurn.completed, output);

  if (!followUp) return;
  if (!firstTurn.conversationId) {
    throw new Error(
      'The first turn did not return a conversation_id; cannot continue the conversation.',
    );
  }

  output.plain('\nFollow-up:\n');
  const followUpStream = output.stream();
  const followUpTurn = await streamTurn(
    client,
    followUp,
    firstTurn.conversationId,
    (delta) => followUpStream.delta(delta),
  );
  followUpStream.complete();
  if (followUpTurn.completed) printCitations(followUpTurn.completed, output);
}
