import { expect, test } from 'vitest';
import { PREVIEW_FIXTURE } from './fixture.js';
import { parsePreviewResult, previewStreamFixture } from './preview.js';

test('parses a completed JSON preview', () => {
  expect(parsePreviewResult(PREVIEW_FIXTURE)).toEqual(PREVIEW_FIXTURE);
});

test('parses a recorded SSE result event', () => {
  expect(parsePreviewResult(previewStreamFixture(PREVIEW_FIXTURE))).toEqual(
    PREVIEW_FIXTURE,
  );
});

test('fails loudly on a recorded SSE GitHub error', () => {
  const sse = [
    'data: {"type":"error","code":"service_unavailable","message":"GitHub is temporarily unavailable."}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  expect(() => parsePreviewResult(sse)).toThrow(/could not fetch GitHub/);
});
