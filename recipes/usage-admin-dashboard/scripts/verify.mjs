import { PERIOD } from '../lib/contracts.mjs';
import { configuredLiveProvider } from '../lib/live.mjs';
import { loadDotEnv } from '../server.mjs';

// Strict, read-only verification: never creates, resets, or updates a policy.
loadDotEnv();
let provider;
try {
  provider = configuredLiveProvider({
    ...process.env,
    GLEAN_ENABLE_WRITES: 'false',
  });
} catch (e) {
  console.error(`${e.message} Fixture tests are not live verification.`);
  process.exitCode = 1;
}
if (provider) {
  let firstUser;
  const checks = [
    [
      'users',
      async () => {
        const page = await provider.catalog('users');
        firstUser = page.results[0]?.user_id;
        return page;
      },
    ],
    ['departments', () => provider.catalog('departments')],
    ['gateway OAuth clients', () => provider.catalog('clients')],
    ['limits', () => provider.limits()],
    [
      'organization evaluation',
      () =>
        provider.evaluate({
          target: { type: 'ORGANIZATION', client_id: 'glean' },
          period: PERIOD,
        }),
    ],
    [
      'user evaluation',
      () => {
        if (!firstUser) throw new Error('No directory user to evaluate.');
        return provider.evaluate({
          target: { type: 'USER', client_id: 'glean', user_id: firstUser },
          period: PERIOD,
        });
      },
    ],
  ];
  for (const [name, check] of checks) {
    try {
      const data = await check();
      console.log(
        `${name}: returned a valid response · request ${data.request_id ?? 'not supplied'}`,
      );
    } catch (e) {
      console.error(`${name}: ${e.message} · ${e.code ?? 'error'}`);
      process.exitCode = 1;
    }
  }
  console.log(
    'Read-only checks only. Policy writes and end-to-end browser behavior still need explicit sandbox QA.',
  );
}
