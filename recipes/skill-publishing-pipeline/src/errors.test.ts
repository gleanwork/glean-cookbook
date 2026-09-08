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
    'npm start -- cleanup --id skill-run-owned --yes --email you@example.com',
  );
  const formatted = formatCliError(error);
  expect(formatted.error).toMatch(/skill-run-owned/);
  expect(formatted.error).not.toMatch(/cleanup completed/);
  expect(formatted.hint).toContain(
    'npm start -- cleanup --id skill-run-owned --yes --email you@example.com',
  );
  expect(formatted.hint).toMatch(/same --email or --server-url/);
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

test('missing access token points at npm run login', () => {
  const formatted = formatCliError(
    new Error('Unable to obtain a Glean access token'),
  );
  expect(formatted.error).toBe('Unable to obtain a Glean access token');
  expect(formatted.hint).toMatch(/npm run login/);
  expect(formatted.error).not.toMatch(/Bearer /);
});

test('non-TTY cleanup refusal names --yes without saying Verification', () => {
  expect(missingCleanupConfirmation(false)).toMatch(/--yes/);
  expect(missingCleanupConfirmation(false)).not.toMatch(/Verification/);
});

test('printCliError never writes cleanup completed', () => {
  const lines: string[] = [];
  printCliError(
    new CleanupFailedError(
      ['skill-run-owned'],
      'npm start -- cleanup --id skill-run-owned --yes --email you@example.com',
    ),
    (message) => lines.push(String(message)),
  );
  expect(lines.join('\n')).not.toMatch(/cleanup completed/);
  expect(lines[0]).toMatch(/^error:/);
});

test('printCliError prints the work error and the cleanup failure', () => {
  const lines: string[] = [];
  printCliError(
    new CleanupFailedError(
      ['skill-run-owned'],
      'npm start -- cleanup --id skill-run-owned --yes --email you@example.com',
      new Error('Validation returned an unexpected skill name.'),
    ),
    (message) => lines.push(String(message)),
  );
  expect(lines[0]).toBe('error: Validation returned an unexpected skill name.');
  expect(lines[1]).toMatch(/^error: Cleanup did not delete skill-run-owned/);
  expect(lines.join('\n')).not.toMatch(/cleanup completed/);
});
