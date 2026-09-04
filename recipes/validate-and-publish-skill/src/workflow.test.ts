import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { verifyFirstPersist, type SkillsApi } from './workflow.js';

const roots: string[] = [];

function streamFor(manifest: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from(manifest));
      controller.close();
    },
  });
}

function fakeApi() {
  let currentManifest = '';
  let deleted = false;
  let createCalls = 0;
  let listCalls = 0;

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
      currentManifest = Buffer.from(request.file.content).toString('utf8');
      const displayName = /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '';
      return {
        skill: {
          id: 'skill-run-owned',
          display_name: displayName,
          description: 'fixture',
          latest_version: 1,
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
    async delete(skillId: string) {
      expect(skillId).toBe('skill-run-owned');
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
  expect(fixture.state()).toEqual({
    createCalls: 1,
    deleted: true,
    listCalls: 1,
  });
});
