import { PERIOD, makeLimit } from '../lib/contracts.mjs';
import { createDemoProvider } from '../lib/demo.mjs';

export const query = {
  target: { type: 'ORGANIZATION' },
  time_range: { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' },
  granularity: 'DAY',
  page_size: 2,
};
export const draft = (options) =>
  makeLimit({
    type: 'USER',
    userId: 'demo-sam',
    clientId: 'glean',
    amount: '600.000001',
    unit: 'CREDITS',
    ...options,
  });
export const evaluation = (target) => ({
  target: { client_id: 'glean', ...target },
  period: PERIOD,
});
export const sam = evaluation({ type: 'USER', user_id: 'demo-sam' });
export const demo = () =>
  createDemoProvider({ now: () => new Date('2026-10-12T12:00:00Z') });
