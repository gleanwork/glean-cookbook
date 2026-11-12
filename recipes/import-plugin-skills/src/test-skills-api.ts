import { strFromU8, unzipSync } from 'fflate';

export const FIXTURE_ORIGIN = 'https://fixture.glean.example.com';

interface StoredSkill {
  skill: {
    skill_id: string;
    display_name: string;
    description: string;
    latest_version: number;
    latest_minor_version: number;
    status: string;
    origin: 'CUSTOM' | 'GITHUB';
    owner: { id: string; name: string };
    created_at: string;
    updated_at: string;
  };
  content: Uint8Array;
}

export function problem(
  status: number,
  detail: string,
  code = 'invalid_request',
) {
  return Response.json(
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

/**
 * An in-memory Skills API for tests. Same-name creates by the same owner add a
 * version, and a same-name create over a GitHub-imported skill returns 409.
 */
export class FakeSkillsApi {
  readonly skills = new Map<string, StoredSkill>();
  readonly calls: string[] = [];
  readonly authorizations = new Set<string>();
  /** Respond to the create call for a skill name with this status instead. */
  readonly createFailures = new Map<string, number>();
  deleteStatus = 204;
  pageSize = 2;
  private nextId = 1;

  constructor(
    private readonly me = { id: 'person-me', name: 'Fixture User' },
  ) {}

  seed(
    name: string,
    options: { origin?: 'CUSTOM' | 'GITHUB'; owner?: string } = {},
  ) {
    const id = `skill-seeded-${this.nextId++}`;
    this.skills.set(id, {
      skill: this.record(id, name, '', 2, 1, options.origin ?? 'CUSTOM', {
        id: options.owner ?? this.me.id,
        name: options.owner ?? this.me.name,
      }),
      content: new Uint8Array(),
    });
    return id;
  }

  count(route: string | RegExp) {
    return this.calls.filter((call) =>
      typeof route === 'string' ? call === route : route.test(call),
    ).length;
  }

  private record(
    id: string,
    name: string,
    description: string,
    version: number,
    minor: number,
    origin: 'CUSTOM' | 'GITHUB',
    owner: { id: string; name: string },
  ): StoredSkill['skill'] {
    return {
      skill_id: id,
      display_name: name,
      description,
      latest_version: version,
      latest_minor_version: minor,
      status: 'ENABLED',
      origin,
      owner,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };
  }

  private async bundle(request: Request) {
    const file = (await request.formData()).get('file');
    if (!file || typeof file === 'string')
      throw new Error('Expected a multipart file.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const files = unzipSync(bytes);
    const manifest = files['SKILL.md'];
    const text = manifest ? strFromU8(manifest) : '';
    return {
      bytes,
      files,
      name: /^name:\s*(.+)$/mu.exec(text)?.[1]?.trim(),
      description: /^description:\s*(.+)$/mu.exec(text)?.[1]?.trim(),
    };
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    this.calls.push(route);
    this.authorizations.add(request.headers.get('authorization') ?? '');

    if (route === 'POST /api/skills/validation') {
      const { files, name, description } = await this.bundle(request);
      if (!name || !description) {
        return problem(400, 'SKILL.md must declare a name and description.');
      }
      return Response.json({
        metadata: { display_name: name, description },
        files: Object.entries(files).map(([path, bytes]) => ({
          path,
          size_bytes: bytes.byteLength,
          is_manifest: path === 'SKILL.md',
        })),
        warnings: [],
        request_id: 'fixture-request',
      });
    }

    if (route === 'POST /api/skills') {
      const { bytes, name, description } = await this.bundle(request);
      if (!name || !description) return problem(400, 'Invalid SKILL.md.');
      const failure = this.createFailures.get(name);
      if (failure) return problem(failure, `Create failed for ${name}.`);
      const mine = [...this.skills.values()].find(
        (stored) =>
          stored.skill.display_name === name &&
          stored.skill.owner.id === this.me.id,
      );
      if (mine?.skill.origin === 'GITHUB') {
        return problem(
          409,
          'This skill is managed by its GitHub source.',
          'conflict',
        );
      }
      if (mine) {
        mine.skill.latest_version += 1;
        mine.content = bytes;
        return Response.json(
          { skill: mine.skill, request_id: 'fixture-request' },
          { status: 201 },
        );
      }
      const id = `skill-${this.nextId++}`;
      const stored = {
        skill: this.record(id, name, description, 1, 1, 'CUSTOM', this.me),
        content: bytes,
      };
      this.skills.set(id, stored);
      return Response.json(
        { skill: stored.skill, request_id: 'fixture-request' },
        { status: 201 },
      );
    }

    if (route === 'GET /api/skills') {
      const all = [...this.skills.values()].map((stored) => stored.skill);
      const start = Number(url.searchParams.get('cursor') ?? '0');
      const end = start + this.pageSize;
      return Response.json({
        results: all.slice(start, end),
        has_more: end < all.length,
        next_cursor: end < all.length ? String(end) : null,
        request_id: 'fixture-request',
      });
    }

    const match = /^\/api\/skills\/([^/]+)(\/content)?$/u.exec(url.pathname);
    const stored = match
      ? this.skills.get(decodeURIComponent(match[1]!))
      : undefined;
    if (match && !stored) return problem(404, 'Skill not found.', 'not_found');
    if (stored && request.method === 'GET' && match?.[2]) {
      return new Response(Buffer.from(stored.content), {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }
    if (stored && request.method === 'GET') {
      return Response.json({
        skill: stored.skill,
        request_id: 'fixture-request',
      });
    }
    if (stored && request.method === 'DELETE') {
      if (this.deleteStatus !== 204)
        return problem(this.deleteStatus, 'Delete failed.');
      this.skills.delete(stored.skill.skill_id);
      return new Response(null, { status: 204 });
    }
    return problem(404, `No fixture route for ${route}.`, 'not_found');
  }
}
