import type {
  PlatformSkillSourcePreviewResponse,
  PlatformSkillSourcePreviewStreamEventServerSentEvent,
} from '@gleanwork/api-client/models/components';
import { skillsSourceStatusHint } from './errors.js';

export async function readPreviewStream(
  events: AsyncIterable<PlatformSkillSourcePreviewStreamEventServerSentEvent>,
  log: (message: string) => void = () => undefined,
): Promise<PlatformSkillSourcePreviewResponse> {
  let result: PlatformSkillSourcePreviewResponse | undefined;
  let streamError: string | undefined;

  for await (const message of events) {
    switch (message.event) {
      case 'SCAN':
        log(`Scan progress: ${message.data.total} item(s)`);
        break;
      case 'PROGRESS':
        break;
      case 'SKILL':
        break;
      case 'RESULT':
        result = message.data.response;
        break;
      case 'ERROR': {
        const { detail, title, status } = message.data.error;
        const summary = detail || title;
        const label =
          status === 403
            ? 'Skills API permission denied'
            : 'GitHub import failed';
        streamError = `${label}: ${summary}.${skillsSourceStatusHint(status)} The import recipe fails rather than skipping.`;
        break;
      }
      default: {
        const unexpected: never = message;
        throw new Error(
          `Streaming preview returned an unexpected event: ${JSON.stringify(unexpected)}`,
        );
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) {
    throw new Error('Streaming preview ended without a result event.');
  }
  return result;
}

export function previewStreamFixture(
  response: PlatformSkillSourcePreviewResponse,
  newline: '\n' | '\r\n' = '\n',
): string {
  const scan = {
    type: 'SCAN',
    total: 1,
    skill_paths: ['skills/skill-creator'],
  };
  const result = { type: 'RESULT', response };
  // The SDK emits an event only after its terminating blank line.
  return [
    'event: SCAN',
    `data: ${JSON.stringify(scan)}`,
    '',
    'event: RESULT',
    `data: ${JSON.stringify(result)}`,
    '',
    '',
  ].join(newline);
}
