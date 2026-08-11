// Presentation entry point. Keep mode selection out of the npm command echo so
// the coding-host transcript stays focused on the recipe rather than its test
// plumbing.
process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';

await import('../server.ts');
