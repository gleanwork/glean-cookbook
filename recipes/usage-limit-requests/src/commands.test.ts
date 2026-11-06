import assert from 'node:assert/strict';
import { Glean } from '@gleanwork/api-client';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest';
import { createUsageRequestsApi, GleanApiError } from './api.js';
import { parseCommand } from './cli.js';
import { directoryLookup } from './client.js';
import { run, type Deps } from './commands.js';
import { formatError } from './errors.js';
import {
  adminRequest,
  EVALUATION,
  NOW,
  ORIGIN,
  page,
  personalRequest,
} from './fixtures.js';

const ADMIN = `${ORIGIN}/api/admin/usage/limit-increase-requests`;
const PERSONAL = `${ORIGIN}/api/usage/limit-increase-requests`;
const EVALUATE = `${ORIGIN}/api/admin/usage/limits/evaluate`;

// The directory is served for every test; a user removed from it returns 404.
const directory = http.get(`${ORIGIN}/api/users/:id`, ({ params }) =>
  params.id === 'gone'
    ? new HttpResponse(
        JSON.stringify({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: 'User not found.',
          code: 'resource_not_found',
          request_id: 'trace-user',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      )
    : HttpResponse.json({
        user: {
          user_id: params.id,
          display_name: `Name of ${String(params.id)}`,
          email: `${String(params.id)}@example.com`,
        },
        request_id: 'trace-user',
      }),
);
const server = setupServer(directory);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function harness(confirm?: Deps['confirm']) {
  const lines: string[] = [];
  const deps: Deps = {
    requests: createUsageRequestsApi({
      origin: ORIGIN,
      token: 'fixture-token',
    }),
    lookupUser: directoryLookup(
      new Glean({ serverURL: ORIGIN, apiToken: 'fixture-token' }),
    ),
    log: (line) => lines.push(line),
    confirm,
    now: () => NOW,
  };
  return {
    lines,
    output: () => lines.join('\n'),
    run: (...argv: string[]) => run(parseCommand(argv), deps),
  };
}

function reviewable(request = adminRequest()) {
  const patches: unknown[] = [];
  server.use(
    http.get(`${ADMIN}/:id`, ({ params }) =>
      params.id === request.request_id
        ? HttpResponse.json({ request, request_id: 'trace-get' })
        : HttpResponse.json(
            { status: 404, code: 'resource_not_found', detail: 'Not found.' },
            { status: 404 },
          ),
    ),
    http.post(EVALUATE, () =>
      HttpResponse.json({ ...EVALUATION, request_id: 'trace-eval' }),
    ),
    http.patch(`${ADMIN}/:id`, async ({ request: patch }) => {
      const body = (await patch.json()) as Record<string, unknown>;
      patches.push(body);
      const resolved =
        body.status === 'APPROVED'
          ? {
              ...request,
              status: 'APPROVED',
              approved_increase_amount: body.approved_increase_amount,
              scope: 'PERIOD',
              resolved_by_user_id: 'admin-1',
            }
          : {
              ...request,
              status: 'DENIED',
              resolution_note: body.resolution_note,
            };
      return HttpResponse.json({
        request: resolved,
        request_id: 'trace-patch',
      });
    }),
  );
  return patches;
}

describe('queue', () => {
  test('lists pending requests with requester names across pages', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(ADMIN, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url);
        assert.equal(
          request.headers.get('authorization'),
          'Bearer fixture-token',
        );
        assert.equal(
          request.headers.get('x-glean-include-experimental'),
          'true',
        );
        return url.searchParams.get('cursor')
          ? HttpResponse.json(
              page(
                [
                  adminRequest({
                    request_id: 'req-2',
                    entity_id: 'gone',
                    requester_user_id: 'gone',
                  }),
                ],
                'next-2',
              ),
            )
          : HttpResponse.json(page([adminRequest()], 'next-1'));
      }),
    );

    const cli = harness();
    await cli.run('queue', '--pages', '2');

    assert.deepEqual(
      seen.map((url) => [
        url.searchParams.get('filters'),
        url.searchParams.get('page_size'),
        url.searchParams.get('cursor'),
      ]),
      [
        ['[{"field":"status","values":["PENDING"]}]', '25', null],
        ['[{"field":"status","values":["PENDING"]}]', '25', 'next-1'],
      ],
    );
    assert.match(cli.output(), /For: Name of user-1 <user-1@example.com>/);
    assert.match(cli.output(), /Why: Quarter-end analysis/);
    assert.match(cli.output(), /For: gone \(not in the directory\)/);
    assert.match(cli.output(), /Pass --pages 3/);
  });

  test('explains a 404 from a workspace without the request APIs', async () => {
    server.use(
      http.get(ADMIN, () =>
        HttpResponse.json(
          {
            status: 404,
            code: 'resource_not_found',
            detail: 'Not found.',
            request_id: 'trace-404',
          },
          { status: 404 },
        ),
      ),
    );
    const error = await harness()
      .run('queue')
      .catch((caught: unknown) => caught);
    assert.ok(error instanceof GleanApiError);
    assert.match(formatError(error), /spend_limit\.requestMore\.enabled/);
    assert.match(formatError(error), /Request ID: trace-404/);
  });
});

describe('show', () => {
  test('shows a pending request with the requester headroom', async () => {
    reviewable();
    const cli = harness();
    await cli.run('show', 'req-1');
    assert.match(cli.output(), /Current limits on glean this month: BLOCKED/);
    assert.match(cli.output(), /Remaining: 0 USD \(HARD\)/);
    assert.match(cli.output(), /DEFAULT_USER limit: 50 USD, used 50/);
  });
});

describe('approve', () => {
  test('sends a PERIOD approval after confirmation', async () => {
    const patches = reviewable();
    const questions: string[] = [];
    const cli = harness((question) => {
      questions.push(question);
      return Promise.resolve(true);
    });

    await cli.run('approve', 'req-1', '--amount', '25');

    assert.deepEqual(questions, [
      'Add 25 USD for 2026-11 only, for Name of user-1 <user-1@example.com> on glean? [y/N] ',
    ]);
    assert.deepEqual(patches, [
      { status: 'APPROVED', approved_increase_amount: '25', scope: 'PERIOD' },
    ]);
    assert.match(cli.output(), /Approved req-1: 25 more for 2026-11/);
  });

  test('changes nothing when the reviewer declines', async () => {
    const patches = reviewable();
    const cli = harness(() => Promise.resolve(false));
    await cli.run('approve', 'req-1', '--amount', '25');
    assert.deepEqual(patches, []);
    assert.match(cli.output(), /Nothing changed/);
  });

  test('requires --yes when input is not interactive', async () => {
    const patches = reviewable();
    await assert.rejects(
      harness().run('approve', 'req-1', '--amount', '25'),
      /Pass --yes/,
    );
    assert.deepEqual(patches, []);

    await harness().run('approve', 'req-1', '--amount', '25', '--yes');
    assert.equal(patches.length, 1);
  });

  test('refuses agent and past-month requests without writing', async () => {
    for (const request of [
      adminRequest({ entity_type: 'AGENT', entity_id: 'agent-1' }),
      adminRequest({ period: '2026-10' }),
    ]) {
      server.resetHandlers();
      const patches = reviewable(request);
      await assert.rejects(
        harness().run('approve', 'req-1', '--amount', '5', '--yes'),
        /adds no capacity|current UTC month/,
      );
      assert.deepEqual(patches, []);
    }
  });

  test('reports a conflict from the server without retrying', async () => {
    let attempts = 0;
    reviewable();
    server.use(
      http.patch(`${ADMIN}/:id`, () => {
        attempts += 1;
        return HttpResponse.json(
          {
            status: 409,
            code: 'conflict',
            detail: 'The request period has ended.',
          },
          { status: 409 },
        );
      }),
    );
    const error = await harness()
      .run('approve', 'req-1', '--amount', '5', '--yes')
      .catch((caught: unknown) => caught);
    assert.equal(attempts, 1);
    assert.match(formatError(error), /HTTP 409: The request period has ended/);
    assert.match(formatError(error), /Run show/);
  });

  test('does not claim a result when the write connection fails', async () => {
    let attempts = 0;
    reviewable();
    server.use(
      http.patch(`${ADMIN}/:id`, () => {
        attempts += 1;
        return HttpResponse.error();
      }),
    );
    await assert.rejects(
      harness().run('approve', 'req-1', '--amount', '5', '--yes'),
      /may or may not have applied/,
    );
    assert.equal(attempts, 1);
  });
});

describe('deny', () => {
  test('records the note only when one is given', async () => {
    const withNote = reviewable();
    await harness().run(
      'deny',
      'req-1',
      '--note',
      'Use the shared pool',
      '--yes',
    );
    server.resetHandlers();
    const withoutNote = reviewable();
    await harness().run('deny', 'req-1', '--yes');
    assert.deepEqual(withNote, [
      { status: 'DENIED', resolution_note: 'Use the shared pool' },
    ]);
    assert.deepEqual(withoutNote, [{ status: 'DENIED' }]);
  });
});

describe('member commands', () => {
  test('files a personal request and reads the personal view', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(PERSONAL, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          {
            request: personalRequest({ request_id: 'req-9' }),
            request_id: 'trace-create',
          },
          { status: 201 },
        );
      }),
    );
    const cli = harness();
    await cli.run(
      'request',
      '--client',
      'glean',
      '--justification',
      'Launch week',
    );
    assert.deepEqual(bodies, [
      { client_id: 'glean', business_justification: 'Launch week' },
    ]);
    assert.match(cli.output(), /Filed req-9 for glean in 2026-11/);
  });

  test('lists your own requests in any status by default', async () => {
    const filters: Array<string | null> = [];
    server.use(
      http.get(PERSONAL, ({ request }) => {
        filters.push(new URL(request.url).searchParams.get('filters'));
        return HttpResponse.json(
          page([
            personalRequest({
              status: 'APPROVED',
              approved_increase_amount: '25',
            }),
          ]),
        );
      }),
    );
    const cli = harness();
    await cli.run('mine');
    assert.deepEqual(filters, [null]);
    assert.match(cli.output(), /Approved increase: 25/);
  });
});

test('verify reads both views and writes nothing', async () => {
  const calls: string[] = [];
  server.use(
    http.get(PERSONAL, ({ request }) => {
      calls.push(`GET ${new URL(request.url).pathname}`);
      return HttpResponse.json(page([]));
    }),
    http.get(ADMIN, ({ request }) => {
      calls.push(`GET ${new URL(request.url).pathname}`);
      return HttpResponse.json(page([adminRequest()]));
    }),
  );
  const cli = harness();
  await cli.run('verify');
  assert.deepEqual(calls, [
    'GET /api/usage/limit-increase-requests',
    'GET /api/admin/usage/limit-increase-requests',
  ]);
  assert.match(cli.output(), /with pending requests/);
});
