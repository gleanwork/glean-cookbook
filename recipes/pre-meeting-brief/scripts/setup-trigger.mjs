import { loadEnv, writeEnv } from '../lib/config.mjs';
import { allPresets, readPreset, request } from '../lib/glean-api.mjs';
import { assertOffset, resolveInputs, selectPreset } from '../lib/presets.mjs';

loadEnv();

const server = (process.env.GLEAN_SERVER_URL || '').replace(/\/$/u, '');
const token = process.env.GLEAN_API_TOKEN;
const webhookUrl = process.env.CURSOR_WEBHOOK_URL;
// Cursor shows the credential as a whole header line — `Authorization: Bearer
// <token>` — so that is what gets pasted. Glean wants the token alone and
// rejects the rest with "Delivery auth secret must be a valid bearer token
// (RFC 6750)", which does not hint at the cause. Accept either form.
const bearer = (process.env.CURSOR_WEBHOOK_BEARER_TOKEN || '')
  .replace(/^\s*Authorization\s*:\s*/iu, '')
  .replace(/^\s*Bearer\s+/iu, '')
  .trim();
const configuredPreset = process.env.GLEAN_CALENDAR_PRESET_ID;
// This recipe demonstrates a 30-minute pre-meeting brief, so it asks for a
// Google Calendar preset that can fire 1,800 seconds ahead. Both are settings,
// not assumptions: point GLEAN_TRIGGER_DATASOURCE and GLEAN_TRIGGER_OFFSET_SECONDS
// somewhere else and the same code registers a different kind of schedule.
//
// GLEAN_TRIGGER_OFFSET_SECONDS=none drops the scheduling requirement entirely,
// which is what makes "registers any preset the catalog serves" true rather
// than nearly true: every other preset family — SLACK_1, JIRA_1, GONG_1 — fires
// on something that already happened and advertises no time_offset at all, so
// an unconditional offset check refused all of them.
const datasource = process.env.GLEAN_TRIGGER_DATASOURCE || 'googlecalendar';
const configuredOffset = process.env.GLEAN_TRIGGER_OFFSET_SECONDS ?? '1800';
const offsetSeconds =
  configuredOffset === 'none' || configuredOffset === ''
    ? undefined
    : configuredOffset;

if (!server || !token || !webhookUrl || !bearer) {
  throw new Error(
    'Set GLEAN_SERVER_URL, GLEAN_API_TOKEN, CURSOR_WEBHOOK_URL, and CURSOR_WEBHOOK_BEARER_TOKEN in .env.',
  );
}
if (!webhookUrl.startsWith('https://')) {
  throw new Error('CURSOR_WEBHOOK_URL must use HTTPS.');
}
if (!/^[A-Za-z0-9\-._~+/]+=*$/u.test(bearer)) {
  throw new Error(
    'CURSOR_WEBHOOK_BEARER_TOKEN is not a valid bearer token (RFC 6750). Copy only the token, not the whole Authorization header.',
  );
}
if (process.env.GLEAN_TRIGGER_ID) {
  throw new Error(
    'GLEAN_TRIGGER_ID is already set; refusing to create a duplicate trigger.',
  );
}

// A missing or wrong GLEAN_CALENDAR_PRESET_ID is a configuration mistake, not a
// crash: print what to do and stop. Anything else keeps its stack, which is
// what you want for a network or API fault.
let listed;
try {
  listed = selectPreset(await allPresets(), configuredPreset, {
    datasource,
    envVar: 'GLEAN_CALENDAR_PRESET_ID',
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const preset = await readPreset(listed.preset_id);
try {
  assertOffset(preset, offsetSeconds);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Whatever this preset requires, not whatever this recipe happens to need.
let inputs;
try {
  inputs = resolveInputs(preset, process.env, { time_offset: offsetSeconds });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

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
if (!body.trigger?.trigger_id || !body.trigger?.signing_secret) {
  if (body.trigger?.trigger_id) {
    await request(`/triggers/${encodeURIComponent(body.trigger.trigger_id)}`, {
      method: 'DELETE',
    });
  }
  throw new Error('Trigger creation returned no trigger id or signing secret.');
}

writeEnv({
  GLEAN_CALENDAR_PRESET_ID: preset.preset_id,
  GLEAN_TRIGGER_ID: body.trigger.trigger_id,
  GLEAN_WEBHOOK_SIGNING_SECRET: body.trigger.signing_secret,
});
console.log(
  `Created ${preset.display_name} at 30 minutes before; trigger id saved to .env.`,
);
