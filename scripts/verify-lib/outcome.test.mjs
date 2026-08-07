import assert from 'node:assert/strict';
import test from 'node:test';
import { verificationExitCode } from './outcome.mjs';

test('a complete successful verification exits 0', () => {
  assert.equal(verificationExitCode({ failed: 0, skipped: 0 }), 0);
});

test('a failed verification exits 1', () => {
  assert.equal(verificationExitCode({ failed: 1, skipped: 0 }), 1);
});

test('a partial verification exits 2', () => {
  assert.equal(verificationExitCode({ failed: 0, skipped: 1 }), 2);
});

test('failures take precedence over skips', () => {
  assert.equal(verificationExitCode({ failed: 1, skipped: 1 }), 1);
});
