// Exercises the /api/chat response parser directly, on the three shapes that
// matter. The distinction it proves -- an unfinished run is not a refusal -- is
// invisible from the outside, because both used to arrive as an empty answer
// with no citations.
import { parsePlatformChatResponse } from '../lib/chat.ts';

const unfinished = parsePlatformChatResponse({
  output: [
    { role: 'assistant', content: [] },
    { role: 'assistant', content: [{ type: 'server_tool_use', text: '' }] },
  ],
});

const refused = parsePlatformChatResponse({
  output: [
    {
      role: 'assistant',
      content: [{ type: 'output_text', text: 'INSUFFICIENT_EVIDENCE' }],
    },
  ],
});

const answered = parsePlatformChatResponse({
  output: [
    {
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Backups are encrypted at rest with AES-256.',
          annotations: [
            {
              sources: [
                { title: 'Data Protection Standard', url: 'https://example/1' },
              ],
            },
          ],
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
