import { expect, test } from 'vitest';
import { GleanError } from '@gleanwork/api-client/models/errors';
import {
  CleanupFailedError,
  formatCliError,
  missingCleanupConfirmation,
  printCliError,
} from './errors.js';

test('failed cleanup names remaining IDs and the recovery command', () => {
  const error = new CleanupFailedError(
    ['skill-run-owned'],
    'npm start -- cleanup --id skill-run-owned --yes',
  );
  const formatted = formatCliError(error);
  expect(formatted.error).toMatch(/skill-run-owned/);
  expect(formatted.error).not.toMatch(/cleanup completed/);
  expect(formatted.hint).toContain(
    'npm start -- cleanup --id skill-run-owned --yes',
  );
});

test('SDK JSON bodies do not print', () => {
  const formatted = formatCliError(
    new GleanError('', {
      response: new Response('{"detail":"Skill is in use"}', {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
      request: new Request('https://fixture.glean.example.com/api/skills/x'),
      body: '{"detail":"Skill is in use","unused":"payload"}',
    }),
  );
  expect(formatted.error).toBe('HTTP 409: Skill is in use');
  expect(formatted.error).not.toMatch(/unused/);
  expect(formatted.error).not.toMatch(/Body:/);
});

test('missing OAuth session points at npm run login', () => {
  const formatted = formatCliError(new Error('OAuth sign-in is required'));
  expect(formatted.hint).toMatch(/npm run login/);
});

test('non-TTY cleanup refusal names --yes', () => {
  expect(missingCleanupConfirmation(false)).toMatch(/--yes/);
});

test('printCliError never writes cleanup completed', () => {
  const lines: string[] = [];
  printCliError(
    new CleanupFailedError(
      ['skill-run-owned'],
      'npm start -- cleanup --id skill-run-owned --yes',
    ),
    (message) => lines.push(String(message)),
  );
  expect(lines.join('\n')).not.toMatch(/cleanup completed/);
  expect(lines[0]).toMatch(/^error:/);
});
