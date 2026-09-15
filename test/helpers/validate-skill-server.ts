import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const SKILL_ID = 'fixture-skill-id';

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function uploadedFile(body: Buffer, contentType = ''): Buffer {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/u
    .exec(contentType)
    ?.slice(1)
    .find(Boolean);
  if (!boundary) throw new Error('Expected multipart boundary');
  const headerEnd = body.indexOf('\r\n\r\n');
  const partEnd = body.indexOf(`\r\n--${boundary}`, headerEnd + 4);
  if (headerEnd < 0 || partEnd < 0) throw new Error('Expected multipart file');
  return body.subarray(headerEnd + 4, partEnd);
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

function skill(uploaded: Buffer) {
  return {
    id: SKILL_ID,
    display_name: /^name:\s*(.+)$/mu.exec(uploaded.toString('utf8'))?.[1] ?? '',
    description: 'fixture',
    latest_version: 1,
    latest_minor_version: 1,
    status: 'DRAFT',
    origin: 'CUSTOM',
    owner: { name: 'Fixture User' },
    created_at: '2026-09-04T00:00:00Z',
    updated_at: '2026-09-04T00:00:00Z',
  };
}

export async function startValidateSkillServer(recipeDirectory: string) {
  const require = createRequire(path.join(recipeDirectory, 'package.json'));
  const { zipSync } = require('fflate') as {
    zipSync(files: Record<string, Uint8Array>): Uint8Array;
  };
  const requests: string[] = [];
  let uploaded = Buffer.alloc(0);
  let created = false;
  let deleted = false;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://fixture');
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    if (request.headers.authorization !== 'Bearer fixture-token') {
      return sendJson(response, 401, { error: 'missing fixture token' });
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/skills/validation'
    ) {
      const bytes = uploadedFile(
        await readBody(request),
        request.headers['content-type'],
      );
      const text = bytes.toString('utf8');
      const name = /^name:\s*(.+)$/mu.exec(text)?.[1];
      const description = /^description:\s*(.+)$/mu.exec(text)?.[1];
      if (!name || !description) {
        response.writeHead(400, {
          'Content-Type': 'application/problem+json',
        });
        return response.end(
          JSON.stringify({
            type: 'about:blank',
            title: 'Request failed',
            status: 400,
            detail: 'SKILL.md must contain frontmatter.',
            code: 'invalid_request',
            request_id: 'fixture-invalid',
          }),
        );
      }
      return sendJson(response, 200, {
        metadata: { display_name: name, description },
        files: [
          {
            path: 'SKILL.md',
            size_bytes: bytes.byteLength,
            is_manifest: true,
          },
        ],
        warnings: [],
        request_id: 'fixture-validate',
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/skills') {
      uploaded = uploadedFile(
        await readBody(request),
        request.headers['content-type'],
      );
      created = true;
      return sendJson(response, 200, {
        skill: skill(uploaded),
        request_id: 'fixture-create',
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/skills') {
      return sendJson(response, 200, {
        skills: created && !deleted ? [skill(uploaded)] : [],
        has_more: false,
        next_cursor: null,
        request_id: 'fixture-list',
      });
    }

    if (
      request.method === 'GET' &&
      url.pathname === `/api/skills/${SKILL_ID}`
    ) {
      return sendJson(response, 200, {
        skill: skill(uploaded),
        request_id: 'fixture-get',
      });
    }

    if (
      request.method === 'GET' &&
      url.pathname === `/api/skills/${SKILL_ID}/content`
    ) {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
      });
      return response.end(Buffer.from(zipSync({ 'SKILL.md': uploaded })));
    }

    if (
      request.method === 'DELETE' &&
      url.pathname === `/api/skills/${SKILL_ID}`
    ) {
      deleted = true;
      response.writeHead(204);
      return response.end();
    }

    sendJson(response, 500, {
      error: `Unexpected fixture request: ${request.method} ${url.pathname}`,
    });
  }

  const server = http.createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not bind');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    state: () => ({ created, deleted }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
