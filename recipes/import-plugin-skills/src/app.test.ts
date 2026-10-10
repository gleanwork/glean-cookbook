import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'vitest';
import { createApp } from './app.js';
import { createGleanClient } from './client.js';
import type { LoginState } from './session.js';
import { removeTrees, skillMd, writeTree } from './test-helpers.js';
import { FakeSkillsApi, FIXTURE_ORIGIN } from './test-skills-api.js';

const server = setupServer();
const recipeRoot = fileURLToPath(new URL('..', import.meta.url));
const HOST = 'localhost:4321';
const KEY = 'fixture-session-key';
const originalToken = process.env.GLEAN_API_TOKEN;
let fake: FakeSkillsApi;
let workDir: string;
let loginStarts: number;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  fake = new FakeSkillsApi();
  server.use(
    http.all(`${FIXTURE_ORIGIN}/api/skills*`, ({ request }) =>
      fake.handle(request),
    ),
  );
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'importer-'));
  loginStarts = 0;
});
afterEach(async () => {
  server.resetHandlers();
  await removeTrees();
  await fs.rm(workDir, { recursive: true, force: true });
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
});
afterAll(() => server.close());

function app() {
  const client = createGleanClient(FIXTURE_ORIGIN);
  const login: LoginState = { status: 'idle' };
  return createApp({
    backend: FIXTURE_ORIGIN,
    sessionKey: KEY,
    allowedHosts: () => new Set([HOST]),
    publicDir: path.join(recipeRoot, 'public'),
    workDir,
    session: {
      login,
      status: () => Promise.resolve({ signedIn: true, via: 'token' as const }),
      startLogin: () => {
        loginStarts += 1;
      },
    },
    skillsApi: () => client.skills,
  });
}

function request(
  pathname: string,
  init: RequestInit & { key?: string | null; host?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set('host', init.host ?? HOST);
  if (init.key !== null) headers.set('x-importer-session', init.key ?? KEY);
  return new Request(`http://${HOST}${pathname}`, { ...init, headers });
}

async function events(response: Response) {
  expect(response.headers.get('content-type')).toBe('application/x-ndjson');
  return (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('serves the page but requires the session key and an expected host for the API', async () => {
  const handle = app();
  const page = await handle(request('/', { key: null }));
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Plugin skill importer');

  expect((await handle(request('/api/session', { key: null }))).status).toBe(
    403,
  );
  expect((await handle(request('/api/session', { key: 'wrong' }))).status).toBe(
    403,
  );
  expect(
    (await handle(request('/api/session', { host: 'evil.example:4321' })))
      .status,
  ).toBe(421);
  expect((await handle(request('/server.ts', { key: null }))).status).toBe(404);

  const session = await handle(request('/api/session'));
  expect(await session.json()).toEqual({
    backend: FIXTURE_ORIGIN,
    signedIn: true,
    via: 'token',
    login: { status: 'idle' },
  });
  expect((await handle(request('/api/login', { method: 'POST' }))).status).toBe(
    202,
  );
  expect(loginStarts).toBe(1);
});

test('previews an uploaded zip and imports only the selected skills', async () => {
  const handle = app();
  const form = new FormData();
  form.append(
    'zip',
    new Blob([
      zipSync({
        'team-plugins-main/skills/review/SKILL.md': strToU8(skillMd('review')),
        'team-plugins-main/skills/release/SKILL.md': strToU8(
          skillMd('release'),
        ),
      }),
    ]),
    'team-plugins-main.zip',
  );
  const planEvents = await events(
    await handle(request('/api/plan', { method: 'POST', body: form })),
  );
  expect(planEvents.at(0)).toEqual({
    type: 'log',
    message: 'Found 2 skill folder(s).',
  });
  const planned = planEvents.at(-1) as {
    type: string;
    planId: string;
    plan: { skills: Array<{ index: number; name: string; action: string }> };
  };
  expect(planned.type).toBe('plan');
  expect(
    planned.plan.skills.map((skill) => [skill.name, skill.action]),
  ).toEqual([
    ['release', 'create'],
    ['review', 'create'],
  ]);
  expect(fake.count('POST /api/skills')).toBe(0);

  const review = planned.plan.skills.find((skill) => skill.name === 'review');
  const importEvents = await events(
    await handle(
      request('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: planned.planId,
          selection: [review?.index],
        }),
      }),
    ),
  );
  expect(importEvents.at(-1)).toMatchObject({
    type: 'result',
    created: 1,
    newVersions: 0,
    failed: 0,
    results: [{ name: 'review', outcome: 'created', version: '1.1' }],
  });
  expect(fake.count('POST /api/skills')).toBe(1);

  const again = await handle(
    request('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: planned.planId, selection: [0] }),
    }),
  );
  expect(again.status).toBe(404);
});

test('previews a local folder path and reports a missing one', async () => {
  const handle = app();
  const root = await writeTree({ 'SKILL.md': skillMd('solo') });
  const form = new FormData();
  form.append('path', root);
  const planned = (
    await events(
      await handle(request('/api/plan', { method: 'POST', body: form })),
    )
  ).at(-1);
  expect(planned).toMatchObject({ type: 'plan', plan: { layout: 'skills' } });

  const missing = new FormData();
  missing.append('path', path.join(root, 'nope'));
  const response = await handle(
    request('/api/plan', { method: 'POST', body: missing }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: `No plugin folder or zip at ${path.join(root, 'nope')}.`,
  });
});

test('rejects an import selection with no ready skills', async () => {
  const handle = app();
  const form = new FormData();
  form.append('path', await writeTree({ 'skills/a/SKILL.md': skillMd('a') }));
  const planned = (
    await events(
      await handle(request('/api/plan', { method: 'POST', body: form })),
    )
  ).at(-1) as { planId: string };
  const response = await handle(
    request('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: planned.planId, selection: [] }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: 'Select at least one skill to publish.',
  });
});

test('runs the test import and retries cleanup only for the IDs it left behind', async () => {
  const handle = app();
  fake.deleteStatus = 403;
  const failed = (
    await events(await handle(request('/api/verify', { method: 'POST' })))
  ).at(-1);
  expect(failed).toMatchObject({
    type: 'error',
    hint: 'Retry the cleanup. It deletes only the test skills this run created.',
    remainingIds: ['skill-1', 'skill-2'],
  });
  const unrelated = fake.seed('unrelated');

  fake.deleteStatus = 204;
  const cleanup = await handle(request('/api/cleanup', { method: 'POST' }));
  expect(await cleanup.json()).toEqual({ remaining: [] });
  expect([...fake.skills.keys()]).toEqual([unrelated]);

  const passed = (
    await events(await handle(request('/api/verify', { method: 'POST' })))
  ).at(-1);
  expect(passed).toMatchObject({ type: 'verified' });
});
