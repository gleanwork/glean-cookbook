// Quiet, environment-gated fixture entry point used by the repository execution check.
process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';

await import('./verify.mjs');
