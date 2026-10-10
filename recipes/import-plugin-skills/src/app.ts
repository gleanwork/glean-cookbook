import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CleanupFailedError, formatError } from './errors.js';
import {
  openPluginSource,
  openZip,
  ZIP_LIMITS,
  zipTooLarge,
} from './plugin-source.js';
import type { Session } from './session.js';
import {
  applyImport,
  planImport,
  planView,
  resultView,
  selectSkills,
  verifyImport,
  type ImportPlan,
  type SkillsApi,
} from './workflow.js';

export interface AppOptions {
  backend: string;
  /** Random per-run key the page must send; blocks other sites in the browser. */
  sessionKey: string;
  /** Host headers this server answers to, such as localhost:4321. */
  allowedHosts: () => ReadonlySet<string>;
  publicDir: string;
  workDir: string;
  session: Pick<Session, 'status' | 'startLogin' | 'login'>;
  skillsApi: () => SkillsApi;
}

const STATIC_FILES: Record<string, string> = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/glean-cookbook.css': 'glean-cookbook.css',
  '/glean-logomark.svg': 'glean-logomark.svg',
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Plans hold skill bundles in memory until they are imported.
const MAX_PLANS = 5;

type Emit = (event: Record<string, unknown>) => void;

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Stream newline-delimited JSON: progress lines, then one final event. */
function stream(work: (emit: Emit) => Promise<void>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await work(emit);
      } catch (error) {
        emit({
          type: 'error',
          ...formatError(error),
          ...(error instanceof CleanupFailedError
            ? { remainingIds: error.remainingIds }
            : {}),
        });
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    },
  });
}

export function createApp(options: AppOptions) {
  const plans = new Map<string, ImportPlan>();
  // Only verify-run IDs that failed to delete may be deleted again.
  const pendingCleanup = new Set<string>();

  function storePlan(plan: ImportPlan) {
    const id = randomBytes(12).toString('hex');
    plans.set(id, plan);
    while (plans.size > MAX_PLANS) {
      const oldest = plans.keys().next().value;
      if (oldest !== undefined) plans.delete(oldest);
    }
    return id;
  }

  async function staticFile(pathname: string) {
    const file = STATIC_FILES[pathname];
    if (!file) return json(404, { error: 'Not found.' });
    const body = await fs.readFile(path.join(options.publicDir, file));
    return new Response(body, {
      headers: {
        'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  }

  async function readPluginSource(request: Request) {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > ZIP_LIMITS.maxArchiveBytes + 1024 * 1024) throw zipTooLarge();
    const form = await request.formData();
    const zip = form.get('zip');
    const folder = form.get('path');
    if (zip && typeof zip !== 'string') {
      return openZip(zip.name, Buffer.from(await zip.arrayBuffer()));
    }
    if (typeof folder === 'string' && folder.trim()) {
      return openPluginSource(folder);
    }
    throw new Error('Choose a plugin .zip file or enter a folder path.');
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? '';
    // Reject DNS-rebinding requests that reach this port under another name.
    if (!options.allowedHosts().has(host)) {
      return json(421, { error: 'Unexpected host.' });
    }
    if (!url.pathname.startsWith('/api/')) {
      return request.method === 'GET'
        ? staticFile(url.pathname)
        : json(405, { error: 'Method not allowed.' });
    }
    if (request.headers.get('x-importer-session') !== options.sessionKey) {
      return json(403, {
        error:
          'Open the importer from the link printed in your terminal. It includes this run’s session key.',
      });
    }

    const route = `${request.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /api/session':
          return json(200, {
            backend: options.backend,
            ...(await options.session.status()),
            login: options.session.login,
          });

        case 'POST /api/login':
          options.session.startLogin();
          return json(202, { login: options.session.login });

        case 'POST /api/plan': {
          const source = await readPluginSource(request);
          return stream(async (emit) => {
            const log = (message: string) => emit({ type: 'log', message });
            const plan = await planImport(options.skillsApi(), source, log);
            emit({
              type: 'plan',
              planId: storePlan(plan),
              plan: planView(plan),
            });
          });
        }

        case 'POST /api/import': {
          const body = (await request.json()) as {
            planId?: string;
            selection?: number[];
          };
          const plan = plans.get(body.planId ?? '');
          if (!plan) {
            return json(404, {
              error: 'Preview the plugin again; that plan expired.',
            });
          }
          const chosen = selectSkills(plan, body.selection ?? []);
          if (chosen.length === 0) {
            return json(400, {
              error: 'Select at least one skill to publish.',
            });
          }
          plans.delete(body.planId ?? '');
          return stream(async (emit) => {
            const log = (message: string) => emit({ type: 'log', message });
            const results = await applyImport(options.skillsApi(), chosen, log);
            emit({ type: 'result', ...resultView(results) });
          });
        }

        case 'POST /api/verify':
          return stream(async (emit) => {
            const log = (message: string) => emit({ type: 'log', message });
            try {
              const message = await verifyImport(options.skillsApi(), {
                workDir: options.workDir,
                log,
              });
              emit({ type: 'verified', message });
            } catch (error) {
              if (error instanceof CleanupFailedError) {
                for (const id of error.remainingIds) pendingCleanup.add(id);
              }
              throw error;
            }
          });

        case 'POST /api/cleanup': {
          const remaining: string[] = [];
          for (const id of [...pendingCleanup]) {
            try {
              await options.skillsApi().delete(id);
              pendingCleanup.delete(id);
            } catch {
              remaining.push(id);
            }
          }
          return json(remaining.length > 0 ? 502 : 200, { remaining });
        }

        default:
          return json(404, { error: 'Not found.' });
      }
    } catch (error) {
      return json(400, formatError(error));
    }
  };
}
