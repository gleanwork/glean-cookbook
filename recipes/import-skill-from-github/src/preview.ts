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

function sseBlocks(preview: string) {
  return preview.split(/\r\n\r\n|\n\n/);
}

function sseLines(block: string) {
  return block.split(/\r\n|\n/);
}

export function parsePreviewResult(
  preview: PlatformSkillSourcePreviewResponse | string,
  log: (message: string) => void = () => undefined,
): PlatformSkillSourcePreviewResponse {
  if (typeof preview !== 'string') return preview;

  let result: PlatformSkillSourcePreviewResponse | undefined;
  let streamError: string | undefined;

  for (const block of sseBlocks(preview)) {
    const dataLine = sseLines(block).find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const data = dataLine.slice('data:'.length).trim();
    if (!data || data === '[DONE]') continue;

    let event: {
      type?: string;
      message?: string;
      code?: string;
      total?: number;
      response?: unknown;
    };
    try {
      event = JSON.parse(data) as {
        type?: string;
        message?: string;
        code?: string;
        total?: number;
        response?: unknown;
      };
    } catch {
      throw new Error('Streaming preview returned an unreadable event.');
    }

    if (event.type === 'error') {
      streamError = event.message ?? event.code ?? 'GitHub preview failed.';
      continue;
    }
    if (event.type === 'scan') {
      const detail =
        typeof event.total === 'number'
          ? `${event.total} item(s)`
          : event.message?.trim() || 'repository scan';
      log(`Scan progress: ${detail}`);
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
  newline: '\n' | '\r\n' = '\n',
): string {
  return [
    'data: {"type":"scan","total":1}',
    '',
    `data: ${JSON.stringify({ type: 'result', response })}`,
    '',
    'data: [DONE]',
    '',
  ].join(newline);
}
