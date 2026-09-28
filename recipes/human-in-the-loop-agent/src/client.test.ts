import fs from 'node:fs';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';
import { afterEach, expect, test, vi } from 'vitest';
import { resolveSettings, SCOPES } from './client.js';

vi.mock('@gleanwork/auth', () => ({
  createGleanTokenProvider: vi.fn(() => async () => 'oauth-token'),
  discoverGleanTenant: vi.fn(async () => ({
    serverUrl: 'https://discovered.example',
  })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

test('OAuth uses a refreshing token provider with the agents scope', async () => {
  const settings = await resolveSettings(
    { agentId: 'agent-1', email: 'me@example.com' },
    {},
  );
  expect(discoverGleanTenant).toHaveBeenCalledExactlyOnceWith('me@example.com');
  expect(createGleanTokenProvider).toHaveBeenCalledExactlyOnceWith({
    serverUrl: 'https://discovered.example',
    scopes: ['agents'],
  });
  expect(typeof settings.apiToken).toBe('function');
  expect(settings).toMatchObject({
    serverURL: 'https://discovered.example',
    agentId: 'agent-1',
  });
});

test('the login script requests the same scope the client uses', () => {
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { scripts: { login: string } };
  expect(pkg.scripts.login).toBe(
    `glean-auth login --scopes ${SCOPES.join(',')}`,
  );
});

test('--agent-id wins over GLEAN_AGENT_ID', async () => {
  const settings = await resolveSettings(
    { agentId: ' flag-agent ', serverUrl: 'https://tenant.example' },
    { GLEAN_AGENT_ID: 'env-agent' },
  );
  expect(settings.agentId).toBe('flag-agent');
});

test('GLEAN_AGENT_ID is used when no flag is passed', async () => {
  const settings = await resolveSettings(
    { serverUrl: 'https://tenant.example' },
    { GLEAN_AGENT_ID: 'env-agent' },
  );
  expect(settings.agentId).toBe('env-agent');
});

test('a missing agent ID points at Agent Builder', async () => {
  await expect(
    resolveSettings({ serverUrl: 'https://tenant.example' }, {}),
  ).rejects.toThrow(/--agent-id.*Agent Builder/);
});

test('GLEAN_API_TOKEN is only a fallback and skips OAuth', async () => {
  const settings = await resolveSettings(
    { agentId: 'agent-1', serverUrl: 'https://tenant.example/' },
    { GLEAN_API_TOKEN: ' fixture-token ' },
  );
  expect(createGleanTokenProvider).not.toHaveBeenCalled();
  expect(settings).toEqual({
    serverURL: 'https://tenant.example',
    apiToken: 'fixture-token',
    agentId: 'agent-1',
  });
});

test('an explicit server URL wins over discovery and GLEAN_SERVER_URL', async () => {
  const settings = await resolveSettings(
    {
      agentId: 'agent-1',
      email: 'me@example.com',
      serverUrl: 'https://explicit.example',
    },
    { GLEAN_SERVER_URL: 'https://configured.example' },
  );
  expect(discoverGleanTenant).not.toHaveBeenCalled();
  expect(settings.serverURL).toBe('https://explicit.example');
});

test.each([
  'http://tenant.example',
  'https://tenant.example/api',
  'https://user:pass@tenant.example',
  'https://tenant.example:8443',
  'not a url',
])('rejects a backend that is not a plain HTTPS origin: %s', async (url) => {
  await expect(
    resolveSettings({ agentId: 'agent-1', serverUrl: url }, {}),
  ).rejects.toThrow(/HTTPS origin/);
});
