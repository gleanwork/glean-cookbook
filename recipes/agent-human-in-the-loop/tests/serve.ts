// Browser tests serve the real app, but intercept API responses in Playwright.
// A missed interception fails: this server has no credentials or real API client.
import { createExplorerServer } from '../src/explorer.js';
import { agentId } from './fixtures.js';
const unexpected = async (): Promise<never> => {
  throw new Error('Unexpected non-mocked API call in browser test.');
};
createExplorerServer(
  {
    create: unexpected,
    get: unexpected,
    respond: unexpected,
    cancel: unexpected,
  },
  agentId,
).listen(4179, '127.0.0.1');
