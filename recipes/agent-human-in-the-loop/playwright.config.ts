import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4179', headless: true },
  webServer: {
    command: 'node --import tsx tests/serve.ts',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
  },
});
