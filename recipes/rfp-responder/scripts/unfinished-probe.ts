import { parsePlatformChatResponse } from '../lib/chat.ts';

function response(text: string, cited = false) {
  return {
    object: 'RESPONSE',
    status: 'COMPLETED',
    output: [
      {
        type: 'MESSAGE',
        role: 'ASSISTANT',
        content: [
          {
            type: 'OUTPUT_TEXT',
            text,
            annotations: cited
              ? [
                  {
                    type: 'CITATION',
                    sources: [
                      {
                        type: 'DOCUMENT',
                        document_id: 'data-protection',
                        title: 'Data Protection Standard',
                        url: 'https://example/1',
                      },
                    ],
                    snippets: [
                      { text: 'Backups are encrypted at rest with AES-256.' },
                    ],
                  },
                ]
              : [],
          },
        ],
      },
    ],
  };
}

const unfinished = parsePlatformChatResponse(response(''));
const refused = parsePlatformChatResponse(response('INSUFFICIENT_EVIDENCE'));
const answered = parsePlatformChatResponse(
  response('Backups are encrypted at rest with AES-256.', true),
);

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
