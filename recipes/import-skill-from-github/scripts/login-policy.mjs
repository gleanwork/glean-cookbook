export function isRecognizedScopeGrantFailure(output) {
  return [
    /\binvalid_scope\b/iu,
    /\bunsupported_scope\b/iu,
    /scope.{0,80}(?:cannot|can't|could not|failed to|not).{0,40}grant/iu,
    /(?:cannot|can't|could not|failed to|not).{0,40}grant.{0,80}scope/iu,
    /grant.{0,80}missing.{0,40}(?:requested )?scope/iu,
  ].some((pattern) => pattern.test(output));
}
