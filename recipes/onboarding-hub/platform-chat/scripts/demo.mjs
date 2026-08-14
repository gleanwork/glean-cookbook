process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_USE_FIXTURE = 'true';
process.env.GLEAN_ONBOARDING_STEPS_FILE = './steps.example.json';
await import('../server.ts');
