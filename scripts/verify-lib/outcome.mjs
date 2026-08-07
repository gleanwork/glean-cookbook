/**
 * Exit status for the live verification gate.
 *
 * Failures take precedence over skips. A partial run is deliberately non-zero
 * so automation cannot mistake an unexercised scenario for verification.
 */
export function verificationExitCode({ failed, skipped }) {
  if (failed > 0) return 1;
  if (skipped > 0) return 2;
  return 0;
}
