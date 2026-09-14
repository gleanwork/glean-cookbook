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

test('public instructions use DCR and pass the supplied SKILL.md', async () => {
  const recipeRoot = new URL('../', import.meta.url);
  const recipe: unknown = JSON.parse(
    await fs.readFile(new URL('recipe.json', recipeRoot), 'utf8'),
  );
  const readme = await fs.readFile(new URL('README.md', recipeRoot), 'utf8');
  const recipeInstructions = JSON.stringify(recipe);
  const publicInstructions = `${recipeInstructions}\n${readme}`;

  expect(recipeInstructions).toContain(
    'registers the OAuth client dynamically',
  );
  expect(readme).toContain('dynamic client registration');
  expect(recipeInstructions).not.toContain('GLEAN_OAUTH_CLIENT_ID');
  expect(readme).not.toContain('GLEAN_OAUTH_CLIENT_ID');
  expect(publicInstructions).toContain(
    'npm start -- --bundle \\"<skill-path>\\" --email \\"<work-email>\\" --yes',
  );
});
