import type { PlatformSkillSourcePreviewResponse } from '@gleanwork/api-client/models/components';

function previewPayload(
  value: unknown,
): value is PlatformSkillSourcePreviewResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PlatformSkillSourcePreviewResponse).skills) &&
    Array.isArray((value as PlatformSkillSourcePreviewResponse).failures) &&
    typeof (value as PlatformSkillSourcePreviewResponse).request_id === 'string'
  );
}

export function parsePreviewResult(
  preview: PlatformSkillSourcePreviewResponse | string,
): PlatformSkillSourcePreviewResponse {
  if (typeof preview !== 'string') return preview;

  let result: PlatformSkillSourcePreviewResponse | undefined;
  let streamError: string | undefined;

  for (const block of preview.split('\n\n')) {
    const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const data = dataLine.slice('data:'.length).trim();
    if (!data || data === '[DONE]') continue;

    let event: {
      type?: string;
      message?: string;
      code?: string;
      response?: unknown;
    };
    try {
      event = JSON.parse(data) as {
        type?: string;
        message?: string;
        code?: string;
        response?: unknown;
      };
    } catch {
      throw new Error('Streaming preview returned an unreadable event.');
    }

    if (event.type === 'error') {
      streamError = event.message ?? event.code ?? 'GitHub preview failed.';
      continue;
    }
    if (event.type === 'result' && previewPayload(event.response)) {
      result = event.response;
    }
  }

  if (streamError) {
    throw new Error(
      `This tenant could not fetch GitHub: ${streamError}. The import recipe fails rather than skipping.`,
    );
  }
  if (!result) {
    throw new Error('Streaming preview ended without a result event.');
  }
  return result;
}

export function previewStreamFixture(
  response: PlatformSkillSourcePreviewResponse,
): string {
  return [
    'data: {"type":"scan","total":1}',
    '',
    `data: ${JSON.stringify({ type: 'result', response })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n');
}
