// What has Glean actually matched?
//
// Silence at the webhook has two very different causes: nothing qualified, or
// something qualified and delivery failed. This asks the API directly, so the
// two stop looking alike. Note the window: events/search looks BACKWARD over
// history, while delivery only fires FORWARD from the moment a trigger was
// created -- a match older than its trigger will never arrive at your endpoint.

import { loadEnv } from '../lib/config.mjs';
import { listTriggers, searchTriggerEvents } from '../lib/glean-api.mjs';

loadEnv();

const configured = (process.env.GLEAN_TRIGGER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const triggers = await listTriggers();
const mine =
  configured.length > 0
    ? triggers.filter((trigger) => configured.includes(trigger.trigger_id))
    : triggers;

if (mine.length === 0) {
  console.log('No triggers to inspect. Run `npm run setup` first.');
  process.exit(0);
}

for (const trigger of mine) {
  const created = trigger.created_at ?? '(unknown)';
  console.log(
    `\n${trigger.preset_id}  ${trigger.trigger_id}  ${trigger.status}\n  created ${created}\n  delivers to ${trigger.delivery?.webhook_url ?? '(no url)'}`,
  );
  const body = await searchTriggerEvents(trigger.trigger_id);
  const events = body.results ?? body.events ?? [];
  if (events.length === 0) {
    console.log('  matched events: 0 (nothing has qualified yet)');
    continue;
  }
  console.log(`  matched events: ${events.length}`);
  for (const item of events) {
    const stale =
      trigger.created_at && item.event_time < trigger.created_at
        ? '  [predates this trigger -- will not be delivered]'
        : '';
    console.log(
      `   - ${item.event_time}  ${item.reason}  ${item.doc_type}  ${item.view_url}${stale}`,
    );
  }
}
