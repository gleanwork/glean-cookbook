import { expect, test } from 'vitest';
import { isRecognizedScopeGrantFailure } from './login-policy.mjs';

test('allows legacy fallback only for recognized scope-grant failures', () => {
  expect(isRecognizedScopeGrantFailure('OAuth error: invalid_scope')).toBe(
    true,
  );
  expect(
    isRecognizedScopeGrantFailure(
      'The authorization server cannot grant the requested scope.',
    ),
  ).toBe(true);
  expect(isRecognizedScopeGrantFailure('network timeout')).toBe(false);
  expect(isRecognizedScopeGrantFailure('invalid_client')).toBe(false);
});
