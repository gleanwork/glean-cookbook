#!/usr/bin/env node

import { loadEnv, writeEnv } from '../lib/config.mjs';
import { allPresets, readPreset, request } from '../lib/glean-api.mjs';
import { assertOffset, resolveInputs, selectPreset } from '../lib/presets.mjs';

loadEnv();

const webhookUrl = process.env.GLEAN_WEBHOOK_URL?.trim();
const bearer = process.env.GLEAN_WEBHOOK_BEARER_TOKEN?.trim();
const datasource = process.env.GLEAN_TRIGGER_DATASOURCE || 'googlecalendar';
const presetId = process.env.GLEAN_TRIGGER_PRESET_ID?.trim();
const offset = process.env.GLEAN_TRIGGER_OFFSET_SECONDS ?? '1800';

if (!webhookUrl || !webhookUrl.startsWith('https://')) {
  throw new Error(
    'Set GLEAN_WEBHOOK_URL to the public HTTPS URL ending in /webhook.',
  );
}
if (!bearer) throw new Error('Set GLEAN_WEBHOOK_BEARER_TOKEN in .env.');
if (process.env.GLEAN_TRIGGER_ID) {
  throw new Error(
    'GLEAN_TRIGGER_ID is already set; delete it before creating another trigger.',
  );
}

const listed = selectPreset(await allPresets(), presetId, {
  datasource,
  envVar: 'GLEAN_TRIGGER_PRESET_ID',
});
const preset = await readPreset(listed.preset_id);
const offsetSeconds = offset === 'none' || offset === '' ? undefined : offset;
assertOffset(preset, offsetSeconds);
const inputs = resolveInputs(preset, process.env, {
  time_offset: offsetSeconds,
});

const body = await request('/triggers', {
  method: 'POST',
  body: JSON.stringify({
    preset_id: preset.preset_id,
    inputs,
    delivery: {
      webhook_url: webhookUrl,
      auth: { type: 'BEARER', secret: bearer },
    },
  }),
});

const trigger = body.trigger;
if (!trigger?.trigger_id || !trigger.signing_secret) {
  if (trigger?.trigger_id) {
    await request(`/triggers/${encodeURIComponent(trigger.trigger_id)}`, {
      method: 'DELETE',
    });
  }
  throw new Error('Trigger creation returned no trigger id or signing secret.');
}

writeEnv({
  GLEAN_TRIGGER_ID: trigger.trigger_id,
  GLEAN_WEBHOOK_SIGNING_SECRET: trigger.signing_secret,
});
console.log(`Created ${preset.preset_id} (${preset.display_name}).`);
console.log(`Trigger ID saved to .env: ${trigger.trigger_id}`);
console.log('The signing secret is saved locally and will not be printed.');
