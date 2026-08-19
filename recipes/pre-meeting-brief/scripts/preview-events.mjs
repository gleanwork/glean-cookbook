import { loadEnv } from '../lib/config.mjs';
import { resolveInputs, selectPreset } from '../lib/presets.mjs';

loadEnv();

const server = (process.env.GLEAN_SERVER_URL || '').replace(/\/$/u, '');
const token = process.env.GLEAN_API_TOKEN;
const configuredPreset = process.env.GLEAN_CALENDAR_PRESET_ID;
// This recipe demonstrates a 30-minute pre-meeting brief, so it asks for a
// Google Calendar preset that can fire 1,800 seconds ahead. Both are settings,
// not assumptions: point GLEAN_TRIGGER_DATASOURCE and GLEAN_TRIGGER_OFFSET_SECONDS
// somewhere else and the same code registers a different kind of schedule.
const datasource = process.env.GLEAN_TRIGGER_DATASOURCE || 'googlecalendar';
// `none` drops the scheduling requirement, matching setup-trigger.mjs -- a
// preset family that does not fire ahead of anything advertises no time_offset.
const configuredOffset = process.env.GLEAN_TRIGGER_OFFSET_SECONDS ?? '1800';
const offsetSeconds =
  configuredOffset === 'none' || configuredOffset === ''
    ? undefined
    : configuredOffset;

if (!server || !token) throw new Error('Sign in to Glean first.');

const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-glean-include-experimental': 'true',
};

async function request(path, options = {}) {
  const response = await fetch(`${server}/api${path}`, { headers, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

// The catalog is paged; stopping at the first page would hide a served preset.
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
const catalog = await allPresets();
// A missing or wrong GLEAN_CALENDAR_PRESET_ID is a configuration mistake, not a
// crash: print what to do and stop. Anything else keeps its stack, which is
// what you want for a network or API fault.
let preset;
try {
  preset = selectPreset(catalog, configuredPreset, {
    datasource,
    offsetSeconds,
    envVar: 'GLEAN_CALENDAR_PRESET_ID',
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const body = await request(
  `/trigger-presets/${encodeURIComponent(preset.preset_id)}/events/search`,
  {
    method: 'POST',
    body: JSON.stringify({
      inputs: resolveInputs(
        preset,
        process.env,
        offsetSeconds === undefined ? {} : { time_offset: offsetSeconds },
      ),
      page_size: 5,
    }),
  },
);
console.log(JSON.stringify(body.results || [], null, 2));
