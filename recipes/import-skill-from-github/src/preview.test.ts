import { expect, test } from 'vitest';
import type { PlatformSkillSourcePreviewStreamEventServerSentEvent } from '@gleanwork/api-client/models/components';
import { PREVIEW_FIXTURE } from './fixture.js';
import { previewStreamFixture, readPreviewStream } from './preview.js';

function stream(
  items: PlatformSkillSourcePreviewStreamEventServerSentEvent[],
): AsyncIterable<PlatformSkillSourcePreviewStreamEventServerSentEvent> {
  return (async function* () {
    for (const item of items) yield item;
  })();
}

const scan: PlatformSkillSourcePreviewStreamEventServerSentEvent = {
  event: 'SCAN',
  data: {
    type: 'SCAN',
    total: 1,
    skill_paths: ['skills/skill-creator'],
  },
};

const previewedSkill = PREVIEW_FIXTURE.skills[0];
if (!previewedSkill) throw new Error('Preview fixture has no skill.');

const result: PlatformSkillSourcePreviewStreamEventServerSentEvent = {
  event: 'RESULT',
  data: { type: 'RESULT', response: PREVIEW_FIXTURE },
};

test('returns the result event from a streamed preview', async () => {
  await expect(readPreviewStream(stream([scan, result]))).resolves.toEqual(
    PREVIEW_FIXTURE,
  );
});

test('logs scan events from a streamed preview', async () => {
  const logs: string[] = [];
  await expect(
    readPreviewStream(stream([scan, result]), (message) => logs.push(message)),
  ).resolves.toEqual(PREVIEW_FIXTURE);
  expect(logs.join('\n')).toMatch(/Scan progress: 1 item\(s\)/);
});

test('ignores progress and skill events', async () => {
  await expect(
    readPreviewStream(
      stream([
        scan,
        {
          event: 'PROGRESS',
          data: {
            type: 'PROGRESS',
            completed: 1,
            total: 1,
            current_skill: 'skills/skill-creator',
          },
        },
        {
          event: 'SKILL',
          data: { type: 'SKILL', skill: previewedSkill },
        },
        result,
      ]),
    ),
  ).resolves.toEqual(PREVIEW_FIXTURE);
});

test('fails loudly on a streamed GitHub error', async () => {
  await expect(
    readPreviewStream(
      stream([
        {
          event: 'ERROR',
          data: {
            type: 'ERROR',
            error: {
              type: 'about:blank',
              title: 'Service Unavailable',
              status: 503,
              detail: 'GitHub is temporarily unavailable.',
              code: 'service_unavailable',
              request_id: 'request-stream-error',
            },
          },
        },
      ]),
    ),
  ).rejects.toThrow(/GitHub import failed: GitHub is temporarily unavailable/);
});

test('recorded SSE fixtures name SCAN and RESULT events', () => {
  const body = previewStreamFixture(PREVIEW_FIXTURE);
  expect(body).toContain('event: SCAN');
  expect(body).toContain('event: RESULT');
  expect(body).toContain('"type":"SCAN"');
  expect(body).toContain('"skill_paths"');
  expect(previewStreamFixture(PREVIEW_FIXTURE, '\r\n')).toContain('\r\n');
});
