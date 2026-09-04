import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { CleanupFailedError } from './errors.js';
import {
  verifiedSuccessLine,
  verifyPublishingLifecycle,
  type SkillsApi,
} from './workflow.js';

const roots: string[] = [];

function streamFor(manifest: string) {
  const archive = zipSync({ 'skill/SKILL.md': strToU8(manifest) });
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(archive);
      controller.close();
    },
  });
}

function fakeApi(options?: { deleteError?: Error }) {
  let currentManifest = '';
  let version = 0;
  let deleted = false;
  let createCalls = 0;

  const api = {
    async validate(request: { file: { content: Uint8Array } }) {
      const content = Buffer.from(request.file.content).toString('utf8');
      const name = /^name:\s*(.+)$/mu.exec(content)?.[1];
      const description = /^description:\s*(.+)$/mu.exec(content)?.[1];
      if (!name || !description) throw new Error('invalid frontmatter');
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
      version += 1;
      currentManifest = Buffer.from(request.file.content).toString('utf8');
      const displayName = /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '';
      return {
        skill: {
          id: 'skill-run-owned',
          display_name: displayName,
          description: 'fixture',
          latest_version: version,
          latest_minor_version: 0,
          status: 'DRAFT',
          origin: 'CUSTOM',
          owner: { name: 'Fixture User' },
          created_at: '2026-09-04T00:00:00Z',
          updated_at: '2026-09-04T00:00:00Z',
        },
        request_id: `request-create-${version}`,
      };
    },
    async retrieve(skillId: string) {
      return {
        skill: {
          id: skillId,
          display_name: /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '',
        },
        request_id: 'request-get',
      };
    },
    async retrieveContent() {
      return { Headers: {}, result: streamFor(currentManifest) };
    },
    async listVersions(skillId: string) {
      return {
        versions: Array.from({ length: version }, (_, index) => ({
          skill_id: skillId,
          version: index + 1,
          minor_version: 0,
          is_latest: index + 1 === version,
          created_by: { name: 'Fixture User' },
          created_at: '2026-09-04T00:00:00Z',
          updated_at: '2026-09-04T00:00:00Z',
        })),
        has_more: false,
        next_cursor: null,
        request_id: 'request-versions',
      };
    },
    async retrieveVersion(skillId: string, requestedVersion: number) {
      return {
        version: {
          skill_id: skillId,
          version: requestedVersion,
          minor_version: 0,
          is_latest: requestedVersion === version,
          created_by: { name: 'Fixture User' },
          created_at: '2026-09-04T00:00:00Z',
          updated_at: '2026-09-04T00:00:00Z',
        },
        request_id: 'request-version',
      };
    },
    async retrieveVersionContent() {
      return { Headers: {}, result: streamFor(currentManifest) };
    },
    async delete(skillId: string) {
      expect(skillId).toBe('skill-run-owned');
      if (options?.deleteError) throw options.deleteError;
      deleted = true;
    },
    async list() {
      return {
        skills: [],
        has_more: false,
        next_cursor: null,
        request_id: 'request-list',
      };
    },
  } as unknown as SkillsApi;

  return {
    api,
    state: () => ({ createCalls, deleted, version }),
  };
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test('validates, supersedes, retrieves, and cleans up one captured skill', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-workflow-test-'));
  roots.push(root);
  const fixture = fakeApi();

  const result = await verifyPublishingLifecycle(fixture.api, {
    workDir: root,
    cleanup: true,
  });

  expect(result).toMatchObject({
    id: 'skill-run-owned',
    version: 2,
    minorVersion: 0,
  });
  expect(verifiedSuccessLine(result)).toMatch(/cleanup completed\.$/);
  expect(fixture.state()).toEqual({
    createCalls: 2,
    deleted: true,
    version: 2,
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
    verifyPublishingLifecycle(fixture.api, {
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
