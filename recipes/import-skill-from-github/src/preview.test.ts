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

test('parses a CRLF-delimited SSE body', () => {
  expect(
    parsePreviewResult(previewStreamFixture(PREVIEW_FIXTURE, '\r\n')),
  ).toEqual(PREVIEW_FIXTURE);
});

test('logs scan events from a streamed preview', () => {
  const logs: string[] = [];
  expect(
    parsePreviewResult(previewStreamFixture(PREVIEW_FIXTURE), (message) =>
      logs.push(message),
    ),
  ).toEqual(PREVIEW_FIXTURE);
  expect(logs.join('\n')).toMatch(/Scan progress: 1 item\(s\)/);
});

test('fails loudly on a recorded SSE GitHub error', () => {
  const sse = [
    'data: {"type":"error","code":"service_unavailable","message":"GitHub is temporarily unavailable."}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  expect(() => parsePreviewResult(sse)).toThrow(/GitHub import failed/);
});
