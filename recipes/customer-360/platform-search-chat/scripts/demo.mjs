process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';
process.env.GLEAN_ACCOUNT_NAME = 'Globex';
await import('../server.ts');
