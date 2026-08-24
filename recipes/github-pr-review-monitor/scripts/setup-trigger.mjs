import { loadEnv, writeEnv } from '../lib/config.mjs';
import {
  allPresets,
  listTriggers,
  readPreset,
  request,
} from '../lib/glean-api.mjs';
import { resolveInputs, selectPresets } from '../lib/presets.mjs';

loadEnv();

const server = (process.env.GLEAN_SERVER_URL || '').replace(/\/$/u, '');
const token = process.env.GLEAN_API_TOKEN;
const webhookUrl = process.env.GLEAN_WEBHOOK_URL;
if (!server || !token || !webhookUrl) {
  throw new Error(
    'Set GLEAN_SERVER_URL, GLEAN_API_TOKEN, and public GLEAN_WEBHOOK_URL in .env first.',
  );
}
if (!webhookUrl.startsWith('https://')) {
  throw new Error('GLEAN_WEBHOOK_URL must be public HTTPS.');
}
if (process.env.GLEAN_TRIGGER_IDS) {
  throw new Error(
    'GLEAN_TRIGGER_IDS is already set; refusing to create duplicate triggers.',
  );
}

// Datasource and presets are configuration, not code. Point this at any
// datasource the Triggers API serves by editing .env.
const datasource = process.env.GLEAN_TRIGGER_DATASOURCE || '';
const configured = (process.env.GLEAN_TRIGGER_PRESET_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const presets = selectPresets(await allPresets(), configured, datasource);
const presetIds = presets.map((preset) => preset.preset_id);

// Resolved for every preset before the first POST, so a missing input stops the
// run rather than leaving half the set registered and rolling the rest back.
//
// Each preset is read individually first: the list carries identity only, so
// asking a list entry for `inputs` yields undefined and every preset looks like
// it requires nothing. Harmless for the GitHub presets, which require none, but
// it would post `inputs: {}` for a preset that does and earn a confusing
// rejection.
//
// The reads sit outside the try: a configuration mistake prints one line and
// stops, while a network or API fault keeps its stack.
const detailed = await Promise.all(
  presetIds.map((presetId) => readPreset(presetId)),
);
let inputsByPreset;
try {
  inputsByPreset = new Map(
    detailed.map((preset) => [
      preset.preset_id,
      resolveInputs(preset, process.env),
    ]),
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// A scaffold with an empty .env cannot see triggers already registered on the
// tenant, so creating blindly leaves the earlier set enabled and delivering to
// whatever URL it was built with -- usually a tunnel that has since died. Their
// signing secrets cannot be re-fetched, so they can never be adopted; the only
// safe moves are to re-point them or delete them, and both are the operator's
// call rather than something setup should do silently.
const existing = (await listTriggers()).filter((trigger) =>
  presetIds.includes(trigger.preset_id),
);
if (
  existing.length > 0 &&
  process.env.GLEAN_TRIGGER_ALLOW_DUPLICATES !== 'true'
) {
  const lines = existing.map(
    (trigger) =>
      `  ${trigger.preset_id}  ${trigger.trigger_id}  ${trigger.status}  -> ${trigger.delivery?.webhook_url ?? '(no url)'}`,
  );
  throw new Error(
    [
      `This tenant already has ${existing.length} trigger(s) for the presets you asked for:`,
      ...lines,
      '',
      'Their signing secrets were returned once, at creation, so this checkout cannot',
      'adopt or re-point them. Pick one:',
      `  In the checkout that created them, run npm run repoint to use ${webhookUrl}`,
      '  npm run triggers -- --delete <trigger_id>   # remove the stale ones, then re-run setup',
      '  GLEAN_TRIGGER_ALLOW_DUPLICATES=true npm run setup   # deliberately register another set',
    ].join('\n'),
  );
}

const created = [];
try {
  for (const presetId of presetIds) {
    const body = await request('/triggers', {
      method: 'POST',
      body: JSON.stringify({
        preset_id: presetId,
        inputs: inputsByPreset.get(presetId),
        delivery: { webhook_url: webhookUrl },
      }),
    });
    if (body.trigger?.trigger_id) created.push(body.trigger);
    if (!body.trigger?.trigger_id || !body.trigger?.signing_secret) {
      throw new Error(`Trigger ${presetId} returned no id or signing secret.`);
    }
  }
} catch (error) {
  const rollback = await Promise.allSettled(
    created.map((trigger) =>
      request(`/triggers/${encodeURIComponent(trigger.trigger_id)}`, {
        method: 'DELETE',
      }),
    ),
  );
  const cleanupErrors = rollback
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [error, ...cleanupErrors],
      `Trigger creation failed and rollback was incomplete. Inspect trigger ids: ${created.map((trigger) => trigger.trigger_id).join(', ')}.`,
    );
  }
  throw error;
}

writeEnv({
  GLEAN_TRIGGER_PRESET_IDS: presetIds.join(','),
  GLEAN_TRIGGER_IDS: created.map((trigger) => trigger.trigger_id).join(','),
  GLEAN_WEBHOOK_SECRETS: created
    .map((trigger) => trigger.signing_secret)
    .join(','),
});
console.log(
  `Created ${created.length} GitHub review trigger(s); secrets saved to .env.`,
);
