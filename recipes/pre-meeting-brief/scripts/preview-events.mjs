import { loadEnv } from '../lib/config.mjs';
import {
  allPresets,
  readPreset,
  searchPresetEvents,
} from '../lib/glean-api.mjs';
import { assertOffset, resolveInputs, selectPreset } from '../lib/presets.mjs';

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

const body = await searchPresetEvents(
  preset.preset_id,
  resolveInputs(
    preset,
    process.env,
    offsetSeconds === undefined ? {} : { time_offset: offsetSeconds },
  ),
  5,
);
console.log(JSON.stringify(body.results || [], null, 2));
