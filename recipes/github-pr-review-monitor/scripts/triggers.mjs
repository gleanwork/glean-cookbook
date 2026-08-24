// List every trigger this tenant serves, or delete one by id.
//
//   node scripts/triggers.mjs
//   node scripts/triggers.mjs --delete <trigger_id>
//
// Deletion is deliberate and one at a time: triggers registered by other tools
// share this list, and a bulk delete would take theirs with yours.

import { loadEnv, withoutTrigger, writeEnv } from '../lib/config.mjs';
import { listTriggers, request } from '../lib/glean-api.mjs';

const inheritedIds = process.env.GLEAN_TRIGGER_IDS;
const inheritedSecrets = process.env.GLEAN_WEBHOOK_SECRETS;
loadEnv();

const flagIndex = process.argv.indexOf('--delete');
const target = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];

if (target) {
  const known = (await listTriggers()).find(
    (trigger) => trigger.trigger_id === target,
  );
  const remaining = withoutTrigger(
    target,
    process.env.GLEAN_TRIGGER_IDS,
    process.env.GLEAN_WEBHOOK_SECRETS,
  );
  if (!known && !remaining)
    throw new Error(`No trigger ${target} on this tenant.`);
  if (known) {
    await request(`/triggers/${encodeURIComponent(target)}`, {
      method: 'DELETE',
    });
  }
  if (remaining) writeEnv(remaining);
  console.log(
    known
      ? `Deleted ${known.preset_id} ${target}.`
      : `Trigger ${target} was already absent; removed its stale local state.`,
  );
  if (
    remaining &&
    (inheritedIds !== undefined || inheritedSecrets !== undefined)
  ) {
    console.warn(
      'GLEAN_TRIGGER_IDS or GLEAN_WEBHOOK_SECRETS is exported in this shell. Unset the exported value before running setup again.',
    );
  }
  process.exit(0);
}

const mine = new Set(
  (process.env.GLEAN_TRIGGER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const triggers = await listTriggers();
if (triggers.length === 0) {
  console.log('This tenant has no triggers.');
  process.exit(0);
}
for (const trigger of triggers) {
  const tag = mine.has(trigger.trigger_id) ? 'this checkout' : 'other';
  console.log(
    `${trigger.preset_id.padEnd(10)} ${trigger.trigger_id}  ${trigger.status.padEnd(8)} ${tag.padEnd(13)} -> ${trigger.delivery?.webhook_url ?? '(no url)'}`,
  );
}
