// Exercises the chat response parser directly, on the three shapes that matter.
// The distinction it proves -- an unfinished run is not a refusal -- is invisible
// from the outside because both have an empty answer with no citations.
import { parseClientChatResponse } from '../lib/chat.ts';

// A run that never produced text: progress narration, then an empty CONTENT.
const unfinished = parseClientChatResponse({
  messages: [
    {
      author: 'GLEAN_AI',
      messageType: 'UPDATE',
      fragments: [{ text: '**Searching company knowledge**' }],
    },
    { author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: '' }] },
  ],
});

// A settled verdict: the model answered, and the answer is a refusal.
const refused = parseClientChatResponse({
  messages: [
    {
      author: 'GLEAN_AI',
      messageType: 'CONTENT',
      fragments: [{ text: 'INSUFFICIENT_EVIDENCE' }],
    },
  ],
});

const answered = parseClientChatResponse({
  messages: [
    {
      author: 'GLEAN_AI',
      messageType: 'CONTENT',
      fragments: [
        { text: 'Backups are encrypted at rest with AES-256.' },
        {
          text: '',
          citation: {
            sourceDocument: {
              title: 'Data Protection Standard',
              url: 'https://example/1',
            },
          },
        },
      ],
    },
  ],
});

console.log(
  JSON.stringify({
    unfinished: {
      unfinished: unfinished.unfinished,
      answer: unfinished.answer,
      citations: unfinished.citations.length,
    },
    refused: {
      unfinished: refused.unfinished,
      answer: refused.answer,
      citations: refused.citations.length,
    },
    answered: {
      unfinished: answered.unfinished,
      answer: answered.answer,
      citations: answered.citations.length,
    },
  }),
);
