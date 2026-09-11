import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { PlatformProblemDetailError } from '@gleanwork/api-client/models/errors';
import { CleanupFailedError } from './errors.js';
import {
  verifiedSuccessLine,
  verifyFirstPersist,
  type SkillsApi,
} from './workflow.js';

const roots: string[] = [];
const sampleSkill = path.join(
  import.meta.dirname,
  '../fixtures/sample-skill/SKILL.md',
);

function streamFor(manifest: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from(manifest));
      controller.close();
    },
  });
}

function validationError() {
  return new PlatformProblemDetailError(
    {
      type: 'about:blank',
      title: 'Invalid request',
      status: 400,
      detail: 'SKILL.md must contain frontmatter.',
      code: 'invalid_request',
      request_id: 'fixture-request',
    },
    {
      request: new Request('https://example.test/api/skills/validation'),
      response: new Response(null, { status: 400 }),
      body: '',
    },
  );
}

function fakeApi(options?: {
  deleteError?: Error;
  retrieveError?: Error;
  invalidValidationError?: Error;
  createdVersion?: number;
  content?: string;
}) {
  let currentManifest = '';
  let deleted = false;
  let createCalls = 0;
  let listCalls = 0;

  const api = {
    async validate(request: { file: { content: Uint8Array } }) {
      const content = Buffer.from(request.file.content).toString('utf8');
      const name = /^name:\s*(.+)$/mu.exec(content)?.[1];
      const description = /^description:\s*(.+)$/mu.exec(content)?.[1];
      if (!name || !description) {
        throw options?.invalidValidationError ?? validationError();
      }
      return {
        metadata: { display_name: name, description },
        files: [
          { path: 'SKILL.md', size_bytes: content.length, is_manifest: true },
        ],
        warnings: [],
        request_id: 'request-validate',
      };
    },
    async create(request: { file: { content: Uint8Array } }) {
      createCalls += 1;
      currentManifest = Buffer.from(request.file.content).toString('utf8');
      const displayName = /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '';
      return {
        skill: {
          id: 'skill-run-owned',
          display_name: displayName,
          description: 'fixture',
          latest_version: options?.createdVersion ?? 1,
          latest_minor_version: 0,
          status: 'DRAFT',
          origin: 'CUSTOM',
          owner: { name: 'Fixture User' },
          created_at: '2026-09-04T00:00:00Z',
          updated_at: '2026-09-04T00:00:00Z',
        },
        request_id: 'request-create',
      };
    },
    async retrieve(skillId: string) {
      if (options?.retrieveError) throw options.retrieveError;
      return {
        skill: {
          id: skillId,
          display_name: /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '',
        },
        request_id: 'request-get',
      };
    },
    async retrieveContent() {
      return {
        Headers: {},
        result: streamFor(options?.content ?? currentManifest),
      };
    },
    async delete(skillId: string) {
      expect(skillId).toBe('skill-run-owned');
      if (options?.deleteError) throw options.deleteError;
      deleted = true;
    },
    async list() {
      listCalls += 1;
      return {
        skills: [
          {
            id: 'skill-run-owned',
            display_name: /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '',
          },
        ],
        has_more: false,
        next_cursor: null,
        request_id: 'request-list',
      };
    },
  } as unknown as SkillsApi;

  return {
    api,
    state: () => ({ createCalls, deleted, listCalls }),
  };
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test.each([
  new Error('HTTP 503 unavailable'),
  new Error('HTTP 401 authentication required'),
  new Error('connection timed out'),
])('does not mistake %s for invalid-frontmatter rejection', async (failure) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-validation-'));
  roots.push(root);
  const fixture = fakeApi({ invalidValidationError: failure });
  await expect(
    verifyFirstPersist(fixture.api, { workDir: root, cleanup: true }),
  ).rejects.toThrow(failure);
  expect(fixture.state().createCalls).toBe(0);
});

test('does not delete a captured skill when create returned a later version', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-ownership-'));
  roots.push(root);
  const fixture = fakeApi({ createdVersion: 2 });
  await expect(
    verifyFirstPersist(fixture.api, { workDir: root, cleanup: true }),
  ).rejects.toThrow(/later version.*skill-run-owned/);
  expect(fixture.state().deleted).toBe(false);
});

test('disables SDK retries when creating a skill', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-retry-'));
  roots.push(root);
  const fixture = fakeApi();
  const create = fixture.api.create.bind(fixture.api);
  fixture.api.create = async (request, options) => {
    expect(options?.retries).toEqual({ strategy: 'none' });
    return create(request, options);
  };
  await verifyFirstPersist(fixture.api, { workDir: root, cleanup: true });
});

test('validates, creates once, retrieves latest content, and cleans up', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-first-persist-'));
  roots.push(root);
  const fixture = fakeApi();

  const result = await verifyFirstPersist(fixture.api, {
    workDir: root,
    cleanup: true,
  });

  expect(result).toMatchObject({
    id: 'skill-run-owned',
    version: 1,
    minorVersion: 0,
  });
  expect(result.contentBytes).toBeGreaterThan(0);
  expect(verifiedSuccessLine(result)).toMatch(/cleanup completed\.$/);
  expect(fixture.state()).toEqual({
    createCalls: 1,
    deleted: true,
    listCalls: 1,
  });
});

test('rejects an empty download and still deletes the test skill', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-empty-'));
  roots.push(root);
  const fixture = fakeApi({ content: '' });
  await expect(
    verifyFirstPersist(fixture.api, { workDir: root, cleanup: true }),
  ).rejects.toThrow('Latest skill content was empty.');
  expect(fixture.state().deleted).toBe(true);
});

test('treats nonempty downloaded content as opaque bytes, not verified files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-download-'));
  roots.push(root);
  const fixture = fakeApi({ content: 'PKnot a valid archive' });
  const result = await verifyFirstPersist(fixture.api, {
    workDir: root,
    cleanup: true,
  });
  expect(result.contentBytes).toBe(21);
  expect(verifiedSuccessLine(result)).toContain('downloaded 21 byte(s)');
  expect(fixture.state().deleted).toBe(true);
});

test('validates the scaffold sample SKILL.md when --bundle is set', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-bundle-'));
  roots.push(root);
  const fixture = fakeApi();

  const result = await verifyFirstPersist(fixture.api, {
    workDir: root,
    cleanup: true,
    bundlePath: sampleSkill,
  });

  expect(result.displayName).toBe('cookbook-validate-and-publish');
  expect(result.id).toBe('skill-run-owned');
  expect(fixture.state().deleted).toBe(true);
});

test('failed delete after a work error still reports both failures', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-both-fail-'));
  roots.push(root);
  const fixture = fakeApi({
    deleteError: Object.assign(new Error('conflict'), { statusCode: 409 }),
    retrieveError: new Error('Direct retrieval returned a different skill.'),
  });

  await expect(
    verifyFirstPersist(fixture.api, {
      workDir: root,
      cleanup: true,
      auth: { email: 'you@example.com' },
    }),
  ).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(CleanupFailedError);
    expect(error).toMatchObject({
      remainingIds: ['skill-run-owned'],
      cleanupCommand:
        'npm start -- cleanup --id skill-run-owned --yes --email you@example.com',
    });
    expect((error as CleanupFailedError).workError).toBeInstanceOf(Error);
    expect(String((error as CleanupFailedError).workError)).toMatch(
      /Direct retrieval returned a different skill/,
    );
    return true;
  });
});

test('failed delete exits without reporting cleanup completed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-cleanup-fail-'));
  roots.push(root);
  const logs: string[] = [];
  const fixture = fakeApi({
    deleteError: Object.assign(new Error('conflict'), { statusCode: 409 }),
  });

  await expect(
    verifyFirstPersist(fixture.api, {
      workDir: root,
      cleanup: true,
      log: (message) => logs.push(message),
    }),
  ).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(CleanupFailedError);
    expect(error).toMatchObject({
      remainingIds: ['skill-run-owned'],
      cleanupCommand: 'npm start -- cleanup --id skill-run-owned --yes',
    });
    expect(String(error)).not.toMatch(/cleanup completed/);
    return true;
  });

  expect(logs.join('\n')).not.toMatch(/cleanup completed/);
  expect(logs.join('\n')).not.toMatch(/Cleanup warning/);
  expect(fixture.state().deleted).toBe(false);
});
