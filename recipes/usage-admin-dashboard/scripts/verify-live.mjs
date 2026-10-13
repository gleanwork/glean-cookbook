import { configuredLiveProvider } from '../lib/live.mjs';

// Strict, read-only verification: never creates, resets, or updates a policy.
if (!process.env.GLEAN_SERVER_URL) {
  console.error(
    'Live verification requires GLEAN_SERVER_URL and an authorized OAuth session or server-side GLEAN_API_TOKEN. Fixture tests are not live verification.',
  );
  process.exitCode = 1;
} else {
  const provider = await configuredLiveProvider({
    ...process.env,
    GLEAN_ENABLE_WRITES: 'false',
  });
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const checks = [
    ['users', true, () => provider.catalog('users')],
    ['departments', true, () => provider.catalog('departments')],
    ['limits', true, () => provider.limits()],
    [
      'organization evaluation',
      true,
      () =>
        provider.evaluate({
          target: { type: 'ORGANIZATION' },
          usage_selector: {
            client_id: 'glean',
            period: { type: 'RECURRING_CALENDAR_MONTH' },
          },
        }),
    ],
    [
      'measured search',
      true,
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
    [
      'OAuth clients (progressive capability)',
      false,
      () => provider.catalog('clients'),
    ],
    [
      'IdP groups (progressive capability)',
      false,
      () => provider.catalog('groups'),
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
