#!/usr/bin/env node

import { loadEnv, writeEnv } from '../lib/config.mjs';
import { request } from '../lib/glean-api.mjs';

loadEnv();
const triggerId = process.env.GLEAN_TRIGGER_ID?.trim();
if (!triggerId) {
  console.error('No GLEAN_TRIGGER_ID is saved; nothing to delete.');
  process.exit(1);
}

await request(`/triggers/${encodeURIComponent(triggerId)}`, {
  method: 'DELETE',
});
writeEnv({ GLEAN_TRIGGER_ID: '', GLEAN_WEBHOOK_SIGNING_SECRET: '' });
console.log(`Deleted trigger ${triggerId} and cleared its local secrets.`);
