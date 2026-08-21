process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';
process.env.GLEAN_ONBOARDING_STEPS_FILE = './steps.json';
await import('../server.ts');
