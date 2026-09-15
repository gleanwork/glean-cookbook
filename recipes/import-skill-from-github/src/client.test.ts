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

test('OAuth uses SKILLS without fallback machinery', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', '');
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

test('public instructions use DCR and no static-client or scope fallback', async () => {
  const recipeRoot = new URL('../', import.meta.url);
  const pkg = await fs.readFile(new URL('package.json', recipeRoot), 'utf8');
  const recipe = await fs.readFile(new URL('recipe.json', recipeRoot), 'utf8');
  const readme = await fs.readFile(new URL('README.md', recipeRoot), 'utf8');
  const instructions = `${pkg}\n${recipe}\n${readme}`;

  expect(pkg).toContain('glean-auth login --scopes SKILLS');
  expect(instructions).toContain('dynamic client registration');
  expect(instructions).not.toMatch(
    /GLEAN_OAUTH_CLIENT_ID|skills:read|skills:write|scope-mode|legacy compatibility/,
  );
  expect(recipe.match(/cd import-skill-from-github &&/gu)).toHaveLength(1);
});
