import fs from 'node:fs/promises';
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

const env = (values: Record<string, string>) => ({
  GLEAN_AGENT_ID: 'agent-1',
  ...values,
});

test('OAuth uses a refreshing token provider with the agents.run scope', async () => {
  const settings = await resolveSettings({ email: 'me@example.com' }, env({}));
  expect(discoverGleanTenant).toHaveBeenCalledExactlyOnceWith('me@example.com');
  expect(createGleanTokenProvider).toHaveBeenCalledExactlyOnceWith({
    serverUrl: 'https://discovered.example',
    scopes: ['agents.run'],
  });
  expect(settings.serverURL).toBe('https://discovered.example');
  expect(typeof settings.apiToken).toBe('function');
  expect(settings.agentId).toBe('agent-1');
});

test('GLEAN_API_TOKEN is only a fallback and skips OAuth', async () => {
  const settings = await resolveSettings(
    { serverUrl: 'https://tenant.example/' },
    env({ GLEAN_API_TOKEN: ' fixture-token ' }),
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
    { email: 'me@example.com', serverUrl: 'https://explicit.example' },
    env({ GLEAN_SERVER_URL: 'https://configured.example' }),
  );
  expect(discoverGleanTenant).not.toHaveBeenCalled();
  expect(settings.serverURL).toBe('https://explicit.example');
});

test('GLEAN_SERVER_URL is used when no email or server URL is passed', async () => {
  const settings = await resolveSettings(
    {},
    env({ GLEAN_SERVER_URL: 'https://configured.example' }),
  );
  expect(settings.serverURL).toBe('https://configured.example');
});

test('a missing agent ID or backend fails before any request', async () => {
  await expect(
    resolveSettings({ serverUrl: 'https://tenant.example' }, {}),
  ).rejects.toThrow(/GLEAN_AGENT_ID/);
  await expect(resolveSettings({}, env({}))).rejects.toThrow(/--email/);
  expect(discoverGleanTenant).not.toHaveBeenCalled();
});

test.each([
  'invalid',
  'http://tenant.example',
  'https://tenant.example/api',
  'https://user:pass@tenant.example',
  'https://tenant.example/?q=1',
  'https://tenant.example:8443',
])('rejects %s as a backend origin', async (serverUrl) => {
  await expect(resolveSettings({ serverUrl }, env({}))).rejects.toThrow(
    /HTTPS origin/,
  );
  expect(createGleanTokenProvider).not.toHaveBeenCalled();
});

test('login, recipe metadata, and the client request the same scope', async () => {
  const root = new URL('../', import.meta.url);
  const pkg: unknown = JSON.parse(
    await fs.readFile(new URL('package.json', root), 'utf8'),
  );
  const recipe: unknown = JSON.parse(
    await fs.readFile(new URL('recipe.json', root), 'utf8'),
  );
  expect(SCOPES).toEqual(['agents.run']);
  expect(pkg).toMatchObject({
    scripts: { login: 'glean-auth login --scopes agents.run' },
  });
  expect(recipe).toMatchObject({
    requiredScopes: ['agents.run'],
    execution: { auth: [{ scopes: ['agents.run'] }] },
  });
});
