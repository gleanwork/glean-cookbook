import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createGleanClient } from './client.js';
import { CleanupFailedError } from './errors.js';
import {
  publishAndStage,
  verifiedSuccessLine,
  verifyPublishingLifecycle,
} from './workflow.js';

const roots: string[] = [];
const originalToken = process.env.GLEAN_API_TOKEN;
const baseUrl = 'https://fixture.glean.example.com';
const skillId = 'skill-run-owned';
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

async function uploadedManifest(request: Request) {
  expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
  expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data;/);
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    throw new Error('Expected a multipart file upload.');
  }
  expect(file.name).toBe('SKILL.md');
  return file.text();
}

function zipResponse(manifest: string) {
  const archive = zipSync({ 'SKILL.md': strToU8(manifest) });
  return new HttpResponse(Uint8Array.from(archive).buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}

function defaultHandlers(options?: {
  deleteStatus?: number;
  invalidContent?: boolean;
}) {
  const manifests: string[] = [];
  const contentPaths: string[] = [];
  let deleted = false;
  let createCalls = 0;

  function skill() {
    const currentManifest = manifests.at(-1) ?? '';
    return {
      id: skillId,
      display_name: /^name:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '',
      description: /^description:\s*(.+)$/mu.exec(currentManifest)?.[1] ?? '',
      latest_version: manifests.length,
      latest_minor_version: 0,
      status: 'DRAFT',
      origin: 'CUSTOM',
      owner: { name: 'Fixture User' },
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    };
  }

  function version(requestedVersion: number) {
    return {
      skill_id: skillId,
      version: requestedVersion,
      minor_version: 0,
      is_latest: requestedVersion === manifests.length,
      created_by: { name: 'Fixture User' },
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    };
  }

  const handlers = [
    http.post(`${baseUrl}/api/skills/validation`, async ({ request }) => {
      const content = await uploadedManifest(request);
      const name = /^name:\s*(.+)$/mu.exec(content)?.[1];
      const description = /^description:\s*(.+)$/mu.exec(content)?.[1];
      if (!name || !description) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Invalid frontmatter',
            code: 'bad_request',
            request_id: 'request-validate-invalid',
          },
          {
            status: 400,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        );
      }
      return HttpResponse.json({
        metadata: { display_name: name, description },
        files: [
          {
            path: 'SKILL.md',
            size_bytes: Buffer.byteLength(content),
            is_manifest: true,
          },
        ],
        warnings: [],
        request_id: 'request-validate',
      });
    }),
    http.post(`${baseUrl}/api/skills`, async ({ request }) => {
      createCalls += 1;
      const content = await uploadedManifest(request);
      expect(content).toMatch(/^name:\s*.+$/mu);
      expect(content).toMatch(/^description:\s*.+$/mu);
      manifests.push(content);
      return HttpResponse.json({
        skill: skill(),
        request_id: `request-create-${manifests.length}`,
      });
    }),
    http.get(`${baseUrl}/api/skills/${skillId}`, () =>
      HttpResponse.json({ skill: skill(), request_id: 'request-get' }),
    ),
    http.get(`${baseUrl}/api/skills/${skillId}/content`, ({ request }) => {
      contentPaths.push(new URL(request.url).pathname);
      if (options?.invalidContent) {
        return new HttpResponse('not-a-zip', {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }
      return zipResponse(manifests.at(-1) ?? '');
    }),
    http.get(`${baseUrl}/api/skills/${skillId}/versions`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('page_size')).toBe('100');
      return HttpResponse.json({
        versions: manifests.map((_, index) => version(index + 1)),
        has_more: false,
        next_cursor: null,
        request_id: 'request-versions',
      });
    }),
    http.get(
      `${baseUrl}/api/skills/${skillId}/versions/:version`,
      ({ params }) => {
        const requestedVersion = Number(params.version);
        expect(manifests[requestedVersion - 1]).toBeDefined();
        return HttpResponse.json({
          version: version(requestedVersion),
          request_id: 'request-version',
        });
      },
    ),
    http.get(
      `${baseUrl}/api/skills/${skillId}/versions/:version/content`,
      ({ params, request }) => {
        contentPaths.push(new URL(request.url).pathname);
        const manifest = manifests[Number(params.version) - 1];
        expect(manifest).toBeDefined();
        return zipResponse(manifest!);
      },
    ),
    http.delete(`${baseUrl}/api/skills/:skillId`, ({ params }) => {
      expect(params.skillId).toBe(skillId);
      if (options?.deleteStatus) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Conflict',
            status: options.deleteStatus,
            detail: 'Skill is in use',
            code: 'conflict',
            request_id: 'request-delete-failed',
          },
          {
            status: options.deleteStatus,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        );
      }
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  ];

  return {
    handlers,
    contentPaths,
    state: () => ({ createCalls, deleted, version: manifests.length }),
  };
}

afterEach(async () => {
  server.resetHandlers();
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

test('validates, supersedes, retrieves, and cleans up one captured skill', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-workflow-test-'));
  roots.push(root);
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const fixture = defaultHandlers();
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  const result = await verifyPublishingLifecycle(client.skills, {
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
  expect(fixture.contentPaths).toEqual([
    `/api/skills/${skillId}/content`,
    `/api/skills/${skillId}/versions/2/content`,
  ]);
});

test('failed delete exits without reporting cleanup completed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-cleanup-fail-'));
  roots.push(root);
  const logs: string[] = [];
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const fixture = defaultHandlers({ deleteStatus: 409 });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  await expect(
    verifyPublishingLifecycle(client.skills, {
      workDir: root,
      cleanup: true,
      log: (message) => logs.push(message),
    }),
  ).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(CleanupFailedError);
    expect(error).toMatchObject({
      remainingIds: ['skill-run-owned'],
      cleanupCommand:
        'npm start -- cleanup --id skill-run-owned --yes --email <your-work-email>',
    });
    expect(String(error)).not.toMatch(/cleanup completed/);
    return true;
  });

  expect(logs.join('\n')).not.toMatch(/cleanup completed/);
  expect(logs.join('\n')).not.toMatch(/Cleanup warning/);
  expect(fixture.state().deleted).toBe(false);
});

test('staging failure after create still printed the skill ID', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-stage-fail-'));
  roots.push(root);
  const skillPath = path.join(root, 'SKILL.md');
  await fs.writeFile(
    skillPath,
    '---\nname: staged-fail\ndescription: fixture\n---\n# Staging failure\n',
    { flag: 'wx', mode: 0o600 },
  );
  const logs: string[] = [];
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const fixture = defaultHandlers({ invalidContent: true });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  await expect(
    publishAndStage(client.skills, {
      bundlePath: skillPath,
      stageDir: path.join(root, 'staged'),
      log: (message) => logs.push(message),
    }),
  ).rejects.toThrow();

  expect(logs.join('\n')).toMatch(
    /Published staged-fail \(skill-run-owned\) at version 1\.0/,
  );
  expect(fixture.state().createCalls).toBe(1);
});
