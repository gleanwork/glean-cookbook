import fs from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { createGleanTokenProvider } from '@gleanwork/auth';
import { createGleanClient } from './client.js';

vi.mock('@gleanwork/auth', () => ({
  createGleanTokenProvider: vi.fn(() => async () => 'fixture-token'),
  discoverGleanTenant: vi.fn(),
}));

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:process')>()),
  loadEnvFile: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

test('OAuth uses the supported SKILLS scope without a fallback mode', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', '');
  vi.stubEnv('GLEAN_SKILLS_SCOPE_MODE', 'native');
  await createGleanClient({ serverUrl: 'https://example.test' });
  expect(createGleanTokenProvider).toHaveBeenCalledExactlyOnceWith({
    serverUrl: 'https://example.test',
    scopes: ['SKILLS'],
  });
});

test('token authentication does not request an OAuth provider', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', 'fixture-token');
  await createGleanClient({ serverUrl: 'https://example.test' });
  expect(createGleanTokenProvider).not.toHaveBeenCalled();
});

test('login and generated instructions use the same supported scope', async () => {
  const recipeRoot = new URL('../', import.meta.url);
  const pkg: unknown = JSON.parse(
    await fs.readFile(new URL('package.json', recipeRoot), 'utf8'),
  );
  const recipe: unknown = JSON.parse(
    await fs.readFile(new URL('recipe.json', recipeRoot), 'utf8'),
  );
  expect(pkg).toMatchObject({
    scripts: { login: 'glean-auth login --scopes SKILLS' },
  });
  expect(recipe).toMatchObject({
    requiredScopes: ['SKILLS'],
    execution: { auth: [{ scopes: ['SKILLS'] }] },
  });
});
