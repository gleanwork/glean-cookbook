import { loadEnv, writeEnv } from '../lib/config.mjs';
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

const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-glean-include-experimental': 'true',
};

async function request(path, options = {}) {
  const response = await fetch(`${server}/api${path}`, { headers, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

// Datasource and presets are configuration, not code. Point this at any
// datasource the Triggers API serves by editing .env.
const datasource = process.env.GLEAN_TRIGGER_DATASOURCE || '';
const configured = (process.env.GLEAN_TRIGGER_PRESET_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
// The catalog is paged. Stopping at the first page would report a preset the
// deployment does serve as unavailable, which is the one thing setup must not do.
async function allPresets() {
  const out = [];
  let cursor = '';
  do {
    const page = await request(
      `/trigger-presets?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    out.push(...(page.results ?? []));
    cursor = page.has_more ? (page.next_cursor ?? '') : '';
  } while (cursor);
  return out;
}

const presets = selectPresets(await allPresets(), configured, datasource);
const presetIds = presets.map((preset) => preset.preset_id);

// Resolved for every preset before the first POST, so a missing input stops the
// run rather than leaving half the set registered and rolling the rest back.
let inputsByPreset;
try {
  inputsByPreset = new Map(
    presets.map((preset) => [
      preset.preset_id,
      resolveInputs(preset, process.env),
    ]),
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
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
