import type { Glean } from '@gleanwork/api-client';
import type { PlatformChatCompletedResponse } from '@gleanwork/api-client/models/components';

export interface ChatTurn {
  completed?: PlatformChatCompletedResponse;
  conversationId?: string;
}

export async function streamTurn(
  client: Glean,
  input: string,
  conversationId?: string,
  onDelta?: (delta: string) => void,
): Promise<ChatTurn> {
  const stream = await client.chat.createStream({
    conversation_id: conversationId,
    input,
    store: true,
  });

  let completed: PlatformChatCompletedResponse | undefined;
  for await (const event of stream) {
    switch (event.event) {
      case 'RESPONSE_OUTPUT_TEXT_DELTA':
        onDelta?.(event.data.delta);
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
  return {
    completed,
    conversationId: completed?.conversation_id ?? undefined,
  };
}
