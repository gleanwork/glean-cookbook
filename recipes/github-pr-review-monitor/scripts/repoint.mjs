// Point existing triggers at the current GLEAN_WEBHOOK_URL.
//
// Quick tunnels rotate, and a trigger outlives the URL it was built with. The
// signing secret is returned once, at creation, so recreating a trigger means
// new secrets and an .env rewrite. PATCH avoids all of that: the secret already
// in .env keeps working.

import { loadEnv } from '../lib/config.mjs';
import { listTriggers, repointTrigger } from '../lib/glean-api.mjs';

loadEnv();

const webhookUrl = process.env.GLEAN_WEBHOOK_URL;
if (!webhookUrl?.startsWith('https://')) {
  throw new Error('Set a public HTTPS GLEAN_WEBHOOK_URL in .env first.');
}

const ids = (process.env.GLEAN_TRIGGER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (ids.length === 0) {
  throw new Error('No GLEAN_TRIGGER_IDS in .env. Run `npm run setup` first.');
}

const known = new Map(
  (await listTriggers()).map((trigger) => [trigger.trigger_id, trigger]),
);

let changed = 0;
for (const id of ids) {
  const trigger = known.get(id);
  if (!trigger) {
    console.log(`${id}  not found on this tenant -- skipped`);
    continue;
  }
  if (trigger.delivery?.webhook_url === webhookUrl) {
    console.log(`${trigger.preset_id}  ${id}  already current`);
    continue;
  }
  await repointTrigger(id, webhookUrl);
  changed += 1;
  console.log(`${trigger.preset_id}  ${id}  -> ${webhookUrl}`);
}
console.log(
  `\n${changed} trigger(s) re-pointed. Signing secrets unchanged, so .env stays valid.`,
);
