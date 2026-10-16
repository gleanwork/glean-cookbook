import fs from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { createGleanTokenProvider, discoverGleanTenant } from '@gleanwork/auth';
import { createDocumentsClient, DOCUMENTS_SCOPE } from './client.js';

vi.mock('@gleanwork/auth', () => ({
  createGleanTokenProvider: vi.fn(() => async () => 'oauth-token'),
  discoverGleanTenant: vi.fn(),
}));

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:process')>()),
  loadEnvFile: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('OAuth requests documents:read and prefers work email over GLEAN_SERVER_URL', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', '');
  vi.stubEnv('GLEAN_SERVER_URL', 'https://wrong-tenant.example');
  vi.mocked(discoverGleanTenant).mockResolvedValue({
    serverUrl: 'https://example.test/',
    instance: 'example',
  });

  const client = await createDocumentsClient({ email: 'Person@Example.com' });

  expect(client.origin).toBe('https://example.test');
  expect(discoverGleanTenant).toHaveBeenCalledExactlyOnceWith(
    'Person@Example.com',
  );
  expect(createGleanTokenProvider).toHaveBeenCalledExactlyOnceWith({
    serverUrl: 'https://example.test',
    scopes: [DOCUMENTS_SCOPE],
  });
});

test('a user-scoped token does not request an OAuth provider', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', 'fixture-token');
  await createDocumentsClient({ serverUrl: 'https://example.test' });
  expect(createGleanTokenProvider).not.toHaveBeenCalled();
  expect(discoverGleanTenant).not.toHaveBeenCalled();
});

test('an auth failure keeps its own message', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', '');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(createGleanTokenProvider).mockReturnValue(async () => {
    throw new Error('Sign-in is required.');
  });

  const client = await createDocumentsClient({
    serverUrl: 'https://example.test',
  });

  await expect(
    client.getDocumentByUrl('https://docs.example/plan', false),
  ).rejects.toThrow(/^Sign-in is required\.$/);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a network failure says Glean could not be reached', async () => {
  vi.stubEnv('GLEAN_API_TOKEN', '');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
  );
  vi.mocked(createGleanTokenProvider).mockReturnValue(
    async () => 'oauth-token',
  );

  const client = await createDocumentsClient({
    serverUrl: 'https://example.test',
  });

  await expect(
    client.getDocumentByUrl('https://docs.example/plan', false),
  ).rejects.toThrow('Could not reach Glean: connect ECONNREFUSED');
});

test('rejects a backend that is not an HTTPS origin', async () => {
  await expect(
    createDocumentsClient({ serverUrl: 'http://example.test' }),
  ).rejects.toThrow(/complete Glean backend HTTPS origin/);
  await expect(
    createDocumentsClient({ serverUrl: 'https://example.test/api' }),
  ).rejects.toThrow(/complete Glean backend HTTPS origin/);
});

test('login, recipe metadata, and the provider use documents:read', async () => {
  const recipeRoot = new URL('../', import.meta.url);
  const pkg: unknown = JSON.parse(
    await fs.readFile(new URL('package.json', recipeRoot), 'utf8'),
  );
  const recipe: unknown = JSON.parse(
    await fs.readFile(new URL('recipe.json', recipeRoot), 'utf8'),
  );
  expect(pkg).toMatchObject({
    scripts: { login: 'glean-auth login --scopes documents:read' },
    dependencies: { '@gleanwork/auth': '1.0.0' },
  });
  expect(pkg).not.toHaveProperty(['dependencies', '@gleanwork/api-client']);
  expect(recipe).toMatchObject({
    hidden: true,
    requiredScopes: ['documents:read'],
    execution: { auth: [{ scopes: ['documents:read'] }] },
  });
});

test('reader-facing source does not teach superseded per-item status enums', async () => {
  const recipeRoot = new URL('../', import.meta.url);
  const files = [
    'README.md',
    'recipe.json',
    'src/cli.ts',
    'src/client.ts',
    'src/documents.ts',
    'src/errors.ts',
    'src/workflow.ts',
  ];
  const banned = [
    'NOT_FOUND_OR_NOT_ALLOWED',
    'INVALID_DOCUMENT_SPEC',
    'CONTENT_UNAVAILABLE',
  ];
  for (const file of files) {
    const text = await fs.readFile(new URL(file, recipeRoot), 'utf8');
    for (const token of banned) expect(text, file).not.toContain(token);
    expect(text, file).not.toMatch(/['"]FOUND['"]/);
  }
});
