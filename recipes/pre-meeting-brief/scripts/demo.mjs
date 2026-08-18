// Quiet, environment-gated entry point for the fixture path.
//
// Sets the demo switches and hands off to the verify gate, so there is one set
// of assertions rather than a demo that drifts from the thing CI runs.

process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';

await import('./verify.mjs');
