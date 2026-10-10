import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
import { createGleanClient } from './client.js';
import { CleanupFailedError } from './errors.js';
import { openPluginSource } from './plugin-source.js';
import { removeTrees, skillMd, writeTree } from './test-helpers.js';
import { FakeSkillsApi, FIXTURE_ORIGIN } from './test-skills-api.js';
import {
  applyImport,
  planImport,
  planView,
  resultView,
  selectSkills,
  verifyImport,
} from './workflow.js';

const server = setupServer();
const originalToken = process.env.GLEAN_API_TOKEN;
let fake: FakeSkillsApi;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  fake = new FakeSkillsApi();
  server.use(
    http.all(`${FIXTURE_ORIGIN}/api/skills*`, ({ request }) =>
      fake.handle(request),
    ),
  );
});
afterEach(async () => {
  server.resetHandlers();
  await removeTrees();
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
});
afterAll(() => server.close());

function skillsApi() {
  return createGleanClient(FIXTURE_ORIGIN).skills;
}

async function plan(files: Record<string, string | object>) {
  return planImport(
    skillsApi(),
    await openPluginSource(await writeTree(files)),
  );
}

const marketplace = (plugins: Array<{ name: string; source: string }>) => ({
  name: 'team',
  owner: { name: 'Team' },
  plugins,
});

test('plans every discovered skill, uploads identical copies once, and flags problems', async () => {
  fake.seed('deploy');
  fake.seed('synced', { origin: 'GITHUB' });
  const result = await plan({
    '.claude-plugin/marketplace.json': marketplace([
      { name: 'core', source: './core' },
      { name: 'core-codex', source: './build/codex/core' },
      { name: 'extras', source: './extras' },
    ]),
    'core/skills/review/SKILL.md': skillMd('review'),
    'core/skills/review/references/checklist.md': '# Checklist\n',
    'build/codex/core/skills/review/SKILL.md': skillMd('review'),
    'build/codex/core/skills/review/references/checklist.md': '# Checklist\n',
    'core/skills/deploy/SKILL.md': skillMd('deploy'),
    'core/skills/synced/SKILL.md': skillMd('synced'),
    'core/skills/broken/SKILL.md': '# No frontmatter\n',
    'core/skills/lint/SKILL.md': skillMd('lint', 'Core lint rules.'),
    'extras/skills/lint/SKILL.md': skillMd('lint', 'Extra lint rules.'),
  });

  const view = planView(result);
  const rows = Object.fromEntries(
    view.skills.map((skill) => [
      skill.dir,
      [skill.action, skill.selected, skill.conflicts.length],
    ]),
  );
  expect(rows).toEqual({
    'core/skills/broken': ['invalid', false, 0],
    'core/skills/deploy': ['new-version', true, 0],
    'core/skills/lint': ['create', false, 1],
    'core/skills/review': ['create', true, 0],
    'core/skills/synced': ['new-version', true, 0],
    'extras/skills/lint': ['create', false, 1],
  });
  expect(fake.count('POST /api/skills/validation')).toBe(6);
  expect(fake.count('POST /api/skills')).toBe(0);
  expect([...fake.authorizations]).toEqual(['Bearer fixture-token']);

  const review = view.skills.find((skill) => skill.name === 'review');
  expect(review?.duplicates).toEqual(['build/codex/core/skills/review']);
  expect(
    view.skills.find((skill) => skill.name === 'synced')?.existing,
  ).toEqual([
    {
      id: expect.stringMatching(/^skill-seeded-/) as string,
      version: '2.1',
      owner: 'Fixture User',
      githubManaged: true,
    },
  ]);
  expect(
    view.skills.find((skill) => skill.dir === 'core/skills/broken')?.problem,
  ).toBe('HTTP 400: SKILL.md must declare a name and description.');
});

test('a selection can resolve a name conflict by picking one skill, but not both', async () => {
  const result = await plan({
    'skills/a/SKILL.md': skillMd('lint', 'One.'),
    '.agents/skills/b/SKILL.md': skillMd('lint', 'Two.'),
    '.claude/skills/c/SKILL.md': skillMd('other'),
  });
  expect(selectSkills(result).map((entry) => entry.displayName)).toEqual([
    'other',
  ]);
  const lint = result.skills.findIndex((entry) => entry.displayName === 'lint');
  expect(
    selectSkills(result, [lint]).map((entry) => entry.displayName),
  ).toEqual(['lint']);
  const both = result.skills
    .map((entry, index) => (entry.displayName === 'lint' ? index : -1))
    .filter((index) => index >= 0);
  expect(() => selectSkills(result, both)).toThrow(
    'Choose only one skill named "lint"',
  );
});

test('publishes each selected skill once, adds versions to your existing skills, and reports failures', async () => {
  const existingId = fake.seed('deploy');
  fake.seed('synced', { origin: 'GITHUB' });
  fake.createFailures.set('flaky', 500);
  const result = await plan({
    'skills/review/SKILL.md': skillMd('review'),
    'skills/deploy/SKILL.md': skillMd('deploy'),
    'skills/synced/SKILL.md': skillMd('synced'),
    'skills/flaky/SKILL.md': skillMd('flaky'),
  });
  const results = await applyImport(skillsApi(), selectSkills(result));

  const view = resultView(results);
  expect(
    Object.fromEntries(view.results.map((row) => [row.name, row.outcome])),
  ).toEqual({
    deploy: 'new-version',
    flaky: 'failed',
    review: 'created',
    synced: 'failed',
  });
  expect([view.created, view.newVersions, view.failed]).toEqual([1, 1, 2]);
  // Create is never retried, even on a retryable 500.
  expect(fake.count('POST /api/skills')).toBe(4);
  expect(fake.skills.get(existingId)?.skill.latest_version).toBe(3);
  expect(view.results.find((row) => row.name === 'synced')?.error).toMatch(
    /HTTP 409.*Sync that skill in Glean/,
  );
});

test('importing again publishes only the skills that changed', async () => {
  const root = await writeTree({
    'skills/a/SKILL.md': skillMd('a'),
    'skills/a/notes.md': 'first\n',
    'skills/b/SKILL.md': skillMd('b'),
  });
  const api = skillsApi();
  await applyImport(
    api,
    selectSkills(await planImport(api, await openPluginSource(root))),
  );

  const unchanged = await planImport(api, await openPluginSource(root));
  expect(unchanged.skills.map((entry) => entry.action)).toEqual([
    'unchanged',
    'unchanged',
  ]);
  expect(selectSkills(unchanged)).toEqual([]);

  await fs.writeFile(path.join(root, 'skills/a/notes.md'), 'second\n');
  const changed = await planImport(api, await openPluginSource(root));
  const results = await applyImport(api, selectSkills(changed));
  expect(
    results.map((result) => [result.planned.displayName, result.outcome]),
  ).toEqual([['a', 'new-version']]);
  expect(fake.count('POST /api/skills')).toBe(3);
});

test('stops uploading after an authorization failure', async () => {
  fake.createFailures.set('a', 403);
  const result = await plan({
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b'),
  });
  const results = await applyImport(skillsApi(), selectSkills(result));
  expect(results.map((entry) => entry.outcome)).toEqual([
    'failed',
    'not-attempted',
  ]);
  expect(fake.count('POST /api/skills')).toBe(1);
});

test('verify publishes a generated plugin, compares downloads, and deletes only what it created', async () => {
  fake.seed('unrelated');
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
  const line = await verifyImport(skillsApi(), { workDir });

  expect(line).toBe(
    'Test import passed: published 2 generated skills, the downloaded files match, and both test skills were deleted.',
  );
  expect(fake.count('POST /api/skills')).toBe(2);
  expect(fake.count(/^GET \/api\/skills\/skill-\d+$/)).toBe(2);
  expect(
    [...fake.skills.values()].map((stored) => stored.skill.display_name),
  ).toEqual(['unrelated']);
  expect(await fs.readdir(workDir)).toEqual([]);
  await fs.rm(workDir, { recursive: true });
});

test('verify still deletes created skills when the download does not match', async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
  server.use(
    http.get(
      `${FIXTURE_ORIGIN}/api/skills/:id/content`,
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
    ),
  );
  await expect(verifyImport(skillsApi(), { workDir })).rejects.toThrow();
  expect(fake.skills.size).toBe(0);
  await fs.rm(workDir, { recursive: true });
});

test('verify deletes the first test skill when the second fails to publish', async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
  const original = fake.handle.bind(fake);
  let creates = 0;
  fake.handle = async (request) => {
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/api/skills'
    ) {
      creates += 1;
      if (creates === 2) {
        return Response.json(
          {
            type: 'about:blank',
            title: 'x',
            status: 400,
            detail: 'Rejected.',
            code: 'invalid_request',
            request_id: 'r',
          },
          {
            status: 400,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        );
      }
    }
    return original(request);
  };
  await expect(verifyImport(skillsApi(), { workDir })).rejects.toThrow(
    /Rejected/,
  );
  expect(fake.skills.size).toBe(0);
  await fs.rm(workDir, { recursive: true });
});

test('verify reports the IDs it could not delete', async () => {
  fake.deleteStatus = 403;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
  const error = await verifyImport(skillsApi(), { workDir }).catch(
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(CleanupFailedError);
  expect((error as CleanupFailedError).remainingIds).toHaveLength(2);
  await fs.rm(workDir, { recursive: true });
});
