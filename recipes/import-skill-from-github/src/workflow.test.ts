import assert from 'node:assert/strict';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createGleanClient } from './client.js';
import {
  githubSkillFixture,
  PINNED_SOURCE_URL,
  PREVIEW_FIXTURE,
} from './fixture.js';
import { previewStreamFixture } from './preview.js';
import { importSkillFromGithub } from './workflow.js';

const originalToken = process.env.GLEAN_API_TOKEN;
const baseUrl = 'https://fixture.glean.example.com';
const server = setupServer();
const skill = githubSkillFixture();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
});

afterAll(() => {
  server.close();
});

function defaultHandlers(options?: {
  preview?: () => Response;
  deleted?: string[];
}) {
  const deleted = options?.deleted ?? [];
  return [
    http.post(`${baseUrl}/api/skills/sources/preview`, async ({ request }) => {
      if (options?.preview) {
        const preview = options.preview();
        return preview;
      }
      const body = (await request.json()) as {
        source_url?: string;
        stream?: boolean;
      };
      expect(body.source_url).toBe(PINNED_SOURCE_URL);
      expect(body.stream).toBe(false);
      return HttpResponse.json(PREVIEW_FIXTURE);
    }),
    http.post(`${baseUrl}/api/skills/import`, async ({ request }) => {
      const body = (await request.json()) as { source_urls?: string[] };
      expect(body.source_urls).toEqual([PINNED_SOURCE_URL]);
      return HttpResponse.json({
        skills: [skill],
        request_id: 'request-import-fixture',
      });
    }),
    http.get(`${baseUrl}/api/skills/${skill.id}`, () =>
      HttpResponse.json({
        skill,
        request_id: 'request-get-fixture',
      }),
    ),
    http.get(`${baseUrl}/api/skills`, () =>
      HttpResponse.json({
        skills: [skill],
        has_more: false,
        next_cursor: null,
        request_id: 'request-list-fixture',
      }),
    ),
    http.post(`${baseUrl}/api/skills/${skill.id}/sync`, () =>
      HttpResponse.json({
        sync_status: 'UP_TO_DATE',
        commit_sha: 'fixture-commit-sha',
        updated: false,
        request_id: 'request-sync-fixture',
      }),
    ),
    http.delete(`${baseUrl}/api/skills/${skill.id}`, () => {
      deleted.push(skill.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

test('previews, imports, syncs, and deletes only run-owned IDs', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const deleted: string[] = [];
  server.use(...defaultHandlers({ deleted }));
  const client = await createGleanClient({ serverUrl: baseUrl });

  const result = await importSkillFromGithub(client.skills, {
    cleanup: true,
  });

  expect(result).toMatchObject({
    ids: [skill.id],
    displayName: 'skill-creator',
    sourceUrl: PINNED_SOURCE_URL,
    commitSha: 'fixture-commit-sha',
    updated: false,
  });
  expect(deleted).toEqual([skill.id]);
});

test('optional --stream consumes recorded SSE preview payloads', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  const deleted: string[] = [];
  server.use(
    ...defaultHandlers({
      deleted,
      preview: () =>
        new HttpResponse(previewStreamFixture(PREVIEW_FIXTURE), {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    }),
  );
  const client = await createGleanClient({ serverUrl: baseUrl });

  await expect(
    importSkillFromGithub(client.skills, { stream: true, cleanup: true }),
  ).resolves.toMatchObject({ ids: [skill.id] });
  expect(deleted).toEqual([skill.id]);
});

test('fails loudly when the tenant cannot fetch GitHub', async () => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
  server.use(
    http.post(`${baseUrl}/api/skills/sources/preview`, () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'GitHub fetch is not permitted for this tenant.',
          code: 'github_unavailable',
          request_id: 'request-preview-failed',
        },
        {
          status: 403,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    ),
  );
  const client = await createGleanClient({ serverUrl: baseUrl });

  await assert.rejects(
    () => importSkillFromGithub(client.skills, { cleanup: true }),
    /could not fetch GitHub/,
  );
});
