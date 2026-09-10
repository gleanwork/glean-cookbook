import { listTriggers } from './glean-api.mjs';

export async function checkTriggers({
  env = process.env,
  getTriggers = listTriggers,
  report,
}) {
  try {
    const triggers = await getTriggers(env);
    report(true, 'your token can call the Triggers API');

    const ids = (env.GLEAN_TRIGGER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    report(
      ids.length > 0,
      'this checkout has trigger IDs from setup',
      ids.length
        ? ''
        : 'the Triggers API answered; this checkout has no stored IDs yet. Run npm run setup',
    );

    const known = new Map(
      triggers.map((trigger) => [trigger.trigger_id, trigger]),
    );
    for (const id of ids) {
      const trigger = known.get(id);
      if (!trigger) {
        report(
          false,
          `${id} still exists`,
          `it was deleted from Glean; run npm run triggers -- --delete ${id}, then npm run setup`,
        );
        continue;
      }
      const current = trigger.delivery?.webhook_url;
      report(
        current === env.GLEAN_WEBHOOK_URL,
        `${trigger.preset_id} delivers to the current URL`,
        current === env.GLEAN_WEBHOOK_URL
          ? ''
          : `points at ${current} -- run npm run repoint`,
      );
      report(
        trigger.status === 'ENABLED',
        `${trigger.preset_id} is enabled`,
        trigger.status === 'ENABLED' ? '' : `status is ${trigger.status}`,
      );
    }
  } catch (error) {
    report(false, 'your token can call the Triggers API', error.message);
  }
}
