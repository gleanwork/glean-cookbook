// Explicit presentation entry point; it never resolves real credentials.
process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';
const { startDashboard } = await import('../server.mjs');
await startDashboard({ live: false });
