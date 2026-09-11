import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { zipSync } from 'fflate';
import { PlatformProblemDetailError } from '@gleanwork/api-client/models/errors';
import { createGleanClient } from './client.js';
import { CleanupFailedError } from './errors.js';
import { verifiedSuccessLine, verifyFirstPersist } from './workflow.js';

const roots: string[] = [];
const sampleSkill = path.join(
  import.meta.dirname,
  '../fixtures/sample-skill/SKILL.md',
);

const originalToken = process.env.GLEAN_API_TOKEN;
const baseUrl = 'https://fixture.glean.example.com';
const skillId = 'skill-run-owned';
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  process.env.GLEAN_API_TOKEN = 'fixture-token';
});

afterAll(() => {
  server.close();
});

function problem(status: number, detail: string, code = 'invalid_request') {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: 'Request failed',
      status,
      detail,
      code,
      request_id: 'fixture-request',
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

async function uploadedBytes(request: Request) {
  expect(request.headers.get('authorization')).toBe('Bearer fixture-token');
  expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data;/);
  const file = (await request.formData()).get('file');
  if (!file || typeof file === 'string') {
    throw new Error('Expected a multipart file upload.');
  }
  expect(file.name).toBe('SKILL.md');
  return Buffer.from(await file.arrayBuffer());
}

function defaultHandlers(options?: {
  deleteStatus?: number;
  retrievedId?: string;
  invalidValidation?: () => Response;
  createResponse?: () => Response;
  createdVersion?: number;
  content?: Uint8Array | ((uploaded: Buffer) => Uint8Array);
}) {
  let uploaded = Buffer.alloc(0);
  let deleted = false;
  let createCalls = 0;
  let listCalls = 0;

  function skill(id = skillId) {
    return {
      id,
      display_name:
        /^name:\s*(.+)$/mu.exec(uploaded.toString('utf8'))?.[1] ?? '',
      description: 'fixture',
      latest_version: options?.createdVersion ?? 1,
      latest_minor_version: 0,
      status: 'DRAFT',
      origin: 'CUSTOM',
      owner: { name: 'Fixture User' },
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    };
  }

  const handlers = [
    http.post(`${baseUrl}/api/skills/validation`, async ({ request }) => {
      const bytes = await uploadedBytes(request);
      const content = bytes.toString('utf8');
      const name = /^name:\s*(.+)$/mu.exec(content)?.[1];
      const description = /^description:\s*(.+)$/mu.exec(content)?.[1];
      if (!name || !description) {
        return (
          options?.invalidValidation?.() ??
          problem(400, 'SKILL.md must contain frontmatter.')
        );
      }
      return HttpResponse.json({
        metadata: { display_name: name, description },
        files: [
          { path: 'SKILL.md', size_bytes: bytes.byteLength, is_manifest: true },
        ],
        warnings: [],
        request_id: 'request-validate',
      });
    }),
    http.post(`${baseUrl}/api/skills`, async ({ request }) => {
      createCalls += 1;
      uploaded = await uploadedBytes(request);
      if (options?.createResponse) return options.createResponse();
      return HttpResponse.json({
        skill: skill(),
        request_id: 'request-create',
      });
    }),
    http.get(`${baseUrl}/api/skills/${skillId}`, () =>
      HttpResponse.json({
        skill: skill(options?.retrievedId),
        request_id: 'request-get',
      }),
    ),
    http.get(`${baseUrl}/api/skills/${skillId}/content`, ({ request }) => {
      // The pilot requests latest content, not a version-specific endpoint.
      expect(new URL(request.url).search).toBe('');
      const content =
        typeof options?.content === 'function'
          ? options.content(uploaded)
          : (options?.content ?? zipSync({ 'SKILL.md': uploaded }));
      return new HttpResponse(Uint8Array.from(content).buffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }),
    http.delete(`${baseUrl}/api/skills/:skillId`, ({ params }) => {
      expect(params.skillId).toBe(skillId);
      if (options?.deleteStatus)
        return problem(options.deleteStatus, 'Skill is in use', 'conflict');
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${baseUrl}/api/skills`, ({ request }) => {
      listCalls += 1;
      expect(new URL(request.url).searchParams.get('page_size')).toBe('100');
      return HttpResponse.json({
        skills: createCalls ? [skill()] : [],
        has_more: false,
        next_cursor: null,
        request_id: 'request-list',
      });
    }),
  ];

  return {
    handlers,
    state: () => ({ createCalls, deleted, listCalls }),
  };
}

afterEach(async () => {
  server.resetHandlers();
  vi.useRealTimers();
  if (originalToken === undefined) delete process.env.GLEAN_API_TOKEN;
  else process.env.GLEAN_API_TOKEN = originalToken;
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

// Advance production backoff while allowing real filesystem and MSW I/O to
// finish. Attach both outcomes first to avoid unhandled rejections.
async function finishRetries(operation: Promise<unknown>) {
  let settled = false;
  void operation.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await vi.waitFor(
    async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(settled).toBe(true);
    },
    { interval: 1, timeout: 5_000 },
  );
  return operation;
}

test.each([503, 401, 'network'] as const)(
  'does not mistake %s for invalid-frontmatter rejection',
  async (failure) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-validation-'));
    roots.push(root);
    let attempts = 0;
    const fixture = defaultHandlers({
      invalidValidation: () => {
        attempts += 1;
        return failure === 'network'
          ? HttpResponse.error()
          : problem(failure, `Validation failed with HTTP ${failure}`);
      },
    });
    server.use(...fixture.handlers);
    const client = await createGleanClient({ serverUrl: baseUrl });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    await expect(
      finishRetries(
        verifyFirstPersist(client.skills, { workDir: root, cleanup: true }),
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (failure === 'network') {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PlatformProblemDetailError);
        expect(String(error)).toMatch(/fetch|network/i);
      } else {
        expect(error).toBeInstanceOf(PlatformProblemDetailError);
        expect(error).toMatchObject({
          status: failure,
          code: 'invalid_request',
        });
      }
      return true;
    });
    expect(attempts).toBeGreaterThanOrEqual(failure === 401 ? 1 : 2);
    expect(fixture.state().createCalls).toBe(0);
    expect(fixture.state().deleted).toBe(false);
    expect(await fs.readdir(root)).toEqual([]);
  },
);

test('does not delete a captured skill when create returned a later version', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-ownership-'));
  roots.push(root);
  const fixture = defaultHandlers({ createdVersion: 2 });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });
  await expect(
    verifyFirstPersist(client.skills, { workDir: root, cleanup: true }),
  ).rejects.toThrow(/later version.*skill-run-owned/);
  expect(fixture.state().deleted).toBe(false);
});

test.each([503, 'network'] as const)(
  'does not retry an ambiguous create after %s',
  async (failure) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-retry-'));
    roots.push(root);
    const fixture = defaultHandlers({
      createResponse: () =>
        failure === 'network'
          ? HttpResponse.error()
          : problem(503, 'Create outcome is unknown', 'unavailable'),
    });
    server.use(...fixture.handlers);
    const client = await createGleanClient({ serverUrl: baseUrl });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    await expect(
      finishRetries(
        verifyFirstPersist(client.skills, { workDir: root, cleanup: true }),
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (failure === 503) {
        expect(error).toBeInstanceOf(PlatformProblemDetailError);
        expect(error).toMatchObject({ status: 503, code: 'unavailable' });
      } else {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toMatch(/fetch|network/i);
      }
      return true;
    });
    await vi.advanceTimersByTimeAsync(100_000);
    expect(fixture.state()).toEqual({
      createCalls: 1,
      deleted: false,
      listCalls: 0,
    });
    expect(await fs.readdir(root)).toEqual([]);
  },
);

test('validates, creates once, retrieves latest content, and cleans up', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-first-persist-'));
  roots.push(root);
  const fixture = defaultHandlers();
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  const result = await verifyFirstPersist(client.skills, {
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
  const fixture = defaultHandlers({ content: Buffer.alloc(0) });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });
  await expect(
    verifyFirstPersist(client.skills, { workDir: root, cleanup: true }),
  ).rejects.toThrow('Latest skill content was empty.');
  expect(fixture.state().deleted).toBe(true);
});

test('rejects changed SKILL.md content even when its name and length match, and cleans up', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-download-'));
  roots.push(root);
  const fixture = defaultHandlers({
    content: (uploaded) =>
      zipSync({
        'SKILL.md': Buffer.from(
          uploaded.toString().replace('Publishing test', 'Publishing pest'),
        ),
      }),
  });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });
  await expect(
    verifyFirstPersist(client.skills, {
      workDir: root,
      cleanup: true,
    }),
  ).rejects.toThrow('Downloaded SKILL.md does not match the uploaded file.');
  expect(fixture.state().deleted).toBe(true);
});

test('rejects a corrupted ZIP checksum even when SKILL.md bytes match, and cleans up', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-crc-'));
  roots.push(root);
  const fixture = defaultHandlers({
    content: (uploaded) => {
      const archive = Buffer.from(zipSync({ 'SKILL.md': uploaded }));
      const central = archive.indexOf(Buffer.from('504b0102', 'hex'));
      // Corrupt the central-directory CRC without changing the file payload.
      archive.writeUInt32LE(
        (archive.readUInt32LE(central + 16) ^ 1) >>> 0,
        central + 16,
      );
      return archive;
    },
  });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });
  await expect(
    verifyFirstPersist(client.skills, {
      workDir: root,
      cleanup: true,
    }),
  ).rejects.toThrow('Downloaded SKILL.md failed its ZIP checksum.');
  expect(fixture.state().deleted).toBe(true);
});

test.each([
  ['symbolic link', { os: 3, attrs: 0o120777 << 16 }],
  ['DOS directory', { os: 0, attrs: 0x10 }],
] as const)('rejects SKILL.md marked as a %s', async (_kind, attributes) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-nonregular-'));
  roots.push(root);
  const fixture = defaultHandlers({
    content: (uploaded) => zipSync({ 'SKILL.md': [uploaded, attributes] }),
  });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });
  await expect(
    verifyFirstPersist(client.skills, {
      workDir: root,
      cleanup: true,
    }),
  ).rejects.toThrow(
    'Downloaded bundle must contain exactly one regular SKILL.md file.',
  );
  expect(fixture.state().deleted).toBe(true);
});

test.each([
  ['plain Markdown instead of a ZIP', (uploaded: Buffer) => uploaded],
  [
    'non-ZIP bytes with a ZIP prefix',
    () => Buffer.from('PKnot a valid archive'),
  ],
  [
    'truncated ZIP',
    (uploaded: Buffer) => zipSync({ 'SKILL.md': uploaded }).slice(0, -12),
  ],
  ['missing SKILL.md', (uploaded: Buffer) => zipSync({ 'OTHER.md': uploaded })],
  [
    'nested SKILL.md',
    (uploaded: Buffer) => zipSync({ 'nested/SKILL.md': uploaded }),
  ],
  [
    'unexpected extra file',
    (uploaded: Buffer) =>
      zipSync({ 'SKILL.md': uploaded, 'extra.txt': Buffer.from('extra') }),
  ],
  ['unsafe path', (uploaded: Buffer) => zipSync({ '../SKILL.md': uploaded })],
] as const)(
  'rejects %s and still cleans up the captured ID',
  async (_name, content) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-invalid-zip-'));
    roots.push(root);
    const fixture = defaultHandlers({ content });
    server.use(...fixture.handlers);
    const client = await createGleanClient({ serverUrl: baseUrl });
    await expect(
      verifyFirstPersist(client.skills, {
        workDir: root,
        cleanup: true,
      }),
    ).rejects.toThrow();
    expect(fixture.state().createCalls).toBe(1);
    expect(fixture.state().deleted).toBe(true);
    expect(await fs.readdir(root)).toEqual([]);
  },
);

test('bounds decompression even when the ZIP lies about the file size', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-zip-size-'));
  roots.push(root);
  const fixture = defaultHandlers({
    content: (uploaded) => {
      const archive = Buffer.from(
        zipSync({ 'SKILL.md': new Uint8Array(1024 * 1024) }),
      );
      const central = archive.indexOf(Buffer.from('504b0102', 'hex'));
      // Claim a small uncompressed size; the actual stream expands to 1 MiB.
      archive.writeUInt32LE(uploaded.byteLength, central + 24);
      return archive;
    },
  });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });
  await expect(
    verifyFirstPersist(client.skills, {
      workDir: root,
      cleanup: true,
    }),
  ).rejects.toThrow(/exceeds|size|bytes/i);
  expect(fixture.state().deleted).toBe(true);
});

test.each([0, 9] as const)(
  'preserves UTF-8 bytes and CRLF with ZIP compression level %s',
  async (level) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-exact-bytes-'));
    roots.push(root);
    const bundlePath = path.join(root, 'SKILL.md');
    await fs.writeFile(
      bundlePath,
      '---\r\nname: exact-bytes\r\ndescription: Preserve uploaded bytes.\r\n---\r\n\r\nCafé 日本語\r\n\r\n',
    );
    const fixture = defaultHandlers({
      content: (uploaded) => zipSync({ 'SKILL.md': uploaded }, { level }),
    });
    server.use(...fixture.handlers);
    const client = await createGleanClient({ serverUrl: baseUrl });
    const result = await verifyFirstPersist(client.skills, {
      workDir: root,
      bundlePath,
      cleanup: true,
    });
    expect(verifiedSuccessLine(result)).toContain(
      'SKILL.md matches the upload',
    );
    expect(fixture.state().deleted).toBe(true);
  },
);

test('validates the scaffold sample SKILL.md when --bundle is set', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-bundle-'));
  roots.push(root);
  const fixture = defaultHandlers();
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  const result = await verifyFirstPersist(client.skills, {
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
  const fixture = defaultHandlers({
    deleteStatus: 409,
    retrievedId: 'skill-other',
  });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  await expect(
    verifyFirstPersist(client.skills, {
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
  const fixture = defaultHandlers({
    deleteStatus: 409,
  });
  server.use(...fixture.handlers);
  const client = await createGleanClient({ serverUrl: baseUrl });

  await expect(
    verifyFirstPersist(client.skills, {
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
