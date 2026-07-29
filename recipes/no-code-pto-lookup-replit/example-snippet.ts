import { Glean } from '@gleanwork/api-client';

const glean = new Glean({
  apiToken: process.env.GLEAN_API_TOKEN,
  instance: process.env.GLEAN_INSTANCE, // e.g. "<your-glean-instance>"
});

export async function askGlean(question: string) {
  const response = await glean.client.chat.create({
    messages: [{ author: 'USER', fragments: [{ text: question }] }],
  });

  const contentMessages = (response.messages ?? []).filter(
    (m) => m.messageType === 'CONTENT',
  );
  const fragments = contentMessages.flatMap((m) => m.fragments ?? []);

  const answer = fragments.map((f) => f.text ?? '').join('');

  const citations = fragments
    .map((f) => f.citation?.sourceDocument)
    .filter(
      (doc): doc is NonNullable<typeof doc> => !!doc?.title && !!doc?.url,
    );
  const uniqueCitations = Array.from(
    new Map(citations.map((doc) => [doc.url, doc])).values(),
  );

  return { answer, citations: uniqueCitations };
}
