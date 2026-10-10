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
  formatPlan,
  planImport,
  summarize,
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

async function skillsApi() {
  return (await createGleanClient({ serverUrl: FIXTURE_ORIGIN })).skills;
}

const marketplace = (plugins: Array<{ name: string; source: string }>) => ({
  name: 'team',
  owner: { name: 'Team' },
  plugins,
});

test('plans every discovered skill, uploads identical copies once, and flags problems', async () => {
  fake.seed('deploy');
  fake.seed('synced', { origin: 'GITHUB' });
  const root = await writeTree({
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

  const plan = await planImport(
    await skillsApi(),
    await openPluginSource(root),
  );
  const actions = Object.fromEntries(
    plan.skills.map((entry) => [entry.bundle.skill.dir, entry.action]),
  );
  expect(actions).toEqual({
    'core/skills/broken': 'invalid',
    'core/skills/deploy': 'new-version',
    'core/skills/lint': 'conflict',
    'core/skills/review': 'create',
    'core/skills/synced': 'new-version',
    'extras/skills/lint': 'conflict',
  });
  expect(fake.count('POST /api/skills/validation')).toBe(6);
  expect(fake.count('POST /api/skills/validation')).toBe(plan.skills.length);
  expect(fake.count('POST /api/skills')).toBe(0);
  expect([...fake.authorizations]).toEqual(['Bearer fixture-token']);

  const text = formatPlan(plan);
  expect(text).toContain(
    'identical copy at build/codex/core/skills/review; uploaded once',
  );
  expect(text).toContain(
    'HTTP 400: SKILL.md must declare a name and description.',
  );
  expect(text).toContain('2 different skills are named "lint"');
  expect(text).toMatch(/synced .*\n.*imported from GitHub/);
});

test('publishes each ready skill once, adds versions to your existing skills, and reports failures', async () => {
  const existingId = fake.seed('deploy');
  fake.seed('synced', { origin: 'GITHUB' });
  fake.createFailures.set('flaky', 500);
  const root = await writeTree({
    'skills/review/SKILL.md': skillMd('review'),
    'skills/deploy/SKILL.md': skillMd('deploy'),
    'skills/synced/SKILL.md': skillMd('synced'),
    'skills/flaky/SKILL.md': skillMd('flaky'),
  });
  const api = await skillsApi();
  const plan = await planImport(api, await openPluginSource(root));
  const results = await applyImport(api, plan);

  const outcomes = Object.fromEntries(
    results.map((result) => [result.planned.displayName ?? '', result.outcome]),
  );
  expect(outcomes).toEqual({
    deploy: 'new-version',
    flaky: 'failed',
    review: 'created',
    synced: 'failed',
  });
  // Create is never retried, even on a retryable 500.
  expect(fake.count('POST /api/skills')).toBe(4);
  expect(fake.skills.get(existingId)?.skill.latest_version).toBe(3);

  const summary = summarize(plan, results);
  expect(summary.complete).toBe(false);
  expect(summary.text).toContain('Published 2 skills from');
  expect(summary.text).toContain('1 created, 1 new version, 0 unchanged.');
  expect(summary.text).toContain('Not published: 2 failed uploads');
  expect(summary.text).toMatch(/synced: HTTP 409.*Sync that skill in Glean/);
});

test('running the import again publishes only the skills that changed', async () => {
  const root = await writeTree({
    'skills/a/SKILL.md': skillMd('a'),
    'skills/a/notes.md': 'first\n',
    'skills/b/SKILL.md': skillMd('b'),
  });
  const api = await skillsApi();
  await applyImport(api, await planImport(api, await openPluginSource(root)));

  const unchanged = await planImport(api, await openPluginSource(root));
  expect(unchanged.skills.map((entry) => entry.action)).toEqual([
    'unchanged',
    'unchanged',
  ]);
  expect(formatPlan(unchanged)).toMatch(/matches skill-\d+ at version 1\.1/);

  await fs.writeFile(path.join(root, 'skills/a/notes.md'), 'second\n');
  const plan = await planImport(api, await openPluginSource(root));
  const results = await applyImport(api, plan);
  expect(
    results.map((result) => [result.planned.displayName, result.outcome]),
  ).toEqual([['a', 'new-version']]);
  expect(summarize(plan, results).text).toContain(
    '0 created, 1 new version, 1 unchanged.',
  );
  expect(fake.count('POST /api/skills')).toBe(3);
});

test('stops uploading after an authorization failure', async () => {
  fake.createFailures.set('a', 403);
  const root = await writeTree({
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b'),
  });
  const api = await skillsApi();
  const results = await applyImport(
    api,
    await planImport(api, await openPluginSource(root)),
  );
  expect(results.map((result) => result.outcome)).toEqual([
    'failed',
    'not-attempted',
  ]);
  expect(fake.count('POST /api/skills')).toBe(1);
});

test('filters by skill name and rejects names it did not find', async () => {
  const root = await writeTree({
    'skills/a/SKILL.md': skillMd('a'),
    'skills/b/SKILL.md': skillMd('b'),
  });
  const api = await skillsApi();
  const source = await openPluginSource(root);
  const plan = await planImport(api, source, { skills: ['b'] });
  expect(plan.skills.map((entry) => entry.displayName)).toEqual(['b']);
  await expect(planImport(api, source, { skills: ['c'] })).rejects.toThrow(
    'No discovered skill named c.',
  );
});

test('verify publishes a generated plugin, compares downloads, and deletes only what it created', async () => {
  fake.seed('unrelated');
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
  const line = await verifyImport(await skillsApi(), { workDir });

  expect(line).toBe(
    'Verified plugin import: published 2 skills from a generated Claude Code marketplace, downloaded files match, cleanup completed.',
  );
  expect(fake.count('POST /api/skills')).toBe(2);
  expect(fake.count(/^GET \/api\/skills\/skill-/)).toBe(4);
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
  await expect(verifyImport(await skillsApi(), { workDir })).rejects.toThrow();
  expect(fake.skills.size).toBe(0);
  await fs.rm(workDir, { recursive: true });
});

test('verify reports the IDs it could not delete', async () => {
  fake.deleteStatus = 403;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
  const error = await verifyImport(await skillsApi(), {
    workDir,
    auth: { email: 'you@example.com' },
  }).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(CleanupFailedError);
  expect((error as CleanupFailedError).remainingIds).toHaveLength(2);
  expect((error as CleanupFailedError).cleanupCommand).toMatch(
    /^npm start -- cleanup --id skill-\d+ --yes --email you@example.com/,
  );
  await fs.rm(workDir, { recursive: true });
});
