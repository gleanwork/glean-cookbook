import { configuredLiveProvider } from '../lib/live.mjs';
import { parseCliArgs } from '../server.mjs';

// Strict, read-only verification: never creates, resets, or updates a policy.
const { email, serverUrl } = parseCliArgs();
if (!email && !serverUrl && !process.env.GLEAN_SERVER_URL) {
  console.error(
    'Live verification needs --email, --server-url, or GLEAN_SERVER_URL, plus an OAuth session from npm run login or a server-side GLEAN_API_TOKEN. Fixture tests are not live verification.',
  );
  process.exitCode = 1;
} else {
  const provider = await configuredLiveProvider({
    email,
    serverUrl,
    env: { ...process.env, GLEAN_ENABLE_WRITES: 'false' },
  });
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const period = { type: 'RECURRING_CALENDAR_MONTH' };
  let firstUser;
  const checks = [
    [
      'users',
      true,
      async () => {
        const page = await provider.catalog('users');
        firstUser = page.results[0]?.user_id;
        return page;
      },
    ],
    ['departments', true, () => provider.catalog('departments')],
    ['gateway OAuth clients', true, () => provider.catalog('clients')],
    ['IdP groups', true, () => provider.catalog('groups')],
    ['limits', true, () => provider.limits()],
    [
      'organization evaluation',
      true,
      () =>
        provider.evaluate({
          target: { type: 'ORGANIZATION', client_id: 'glean' },
          period,
        }),
    ],
    [
      'user evaluation',
      true,
      () => {
        if (!firstUser) throw new Error('No directory user to evaluate.');
        return provider.evaluate({
          target: { type: 'USER', client_id: 'glean', user_id: firstUser },
          period,
        });
      },
    ],
    [
      'measured search (draft reporting API, not yet released)',
      false,
      () =>
        provider.search({
          target: { type: 'ORGANIZATION' },
          time_range: {
            start: start.toISOString().replace('.000Z', 'Z'),
            end: end.toISOString().replace('.000Z', 'Z'),
          },
          granularity: 'DAY',
          group_by: ['PRODUCT'],
          page_size: 1000,
        }),
    ],
  ];
  for (const [name, required, check] of checks) {
    try {
      const data = await check();
      console.log(
        `${name}: returned a valid response · request ${data.request_id ?? 'not supplied'}`,
      );
    } catch (e) {
      console.error(`${name}: ${e.message} · ${e.code ?? 'error'}`);
      if (required) process.exitCode = 1;
    }
  }
  console.log(
    'Read-only checks only. Policy writes and end-to-end browser behavior still need explicit sandbox QA.',
  );
}
