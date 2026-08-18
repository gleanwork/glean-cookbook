// Nothing here can make a meeting happen 30 minutes from now, so what is
// verifiable is the precondition: a calendar preset advertising a required
// time_offset that offers 1,800 seconds. A deployment can serve calendar presets
// and still not serve one that fires ahead. Reuses the recipe's own helper.

import {
  offersOffset,
  presetsFor,
} from '../../recipes/pre-meeting-brief/lib/presets.mjs';
import { assertServes, triggerPresets } from '../verify-lib/triggers.mjs';

// Reads the preset catalog. Nothing is created, delivered, or written.
export const sideEffects = 'read-only';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  ['GLEAN_SERVER_URL', 'GLEAN_INSTANCE'],
];

const OFFSET_SECONDS = '1800';

export async function setup() {
  return { presets: await triggerPresets() };
}

export async function run(query, { presets }) {
  const problem = assertServes(presets, 'googlecalendar');
  if (problem) return problem;

  const usable = presetsFor(presets, 'googlecalendar').filter((preset) =>
    offersOffset(preset, OFFSET_SECONDS),
  );
  if (usable.length === 0) {
    const served = presetsFor(presets, 'googlecalendar')
      .map((preset) => `${preset.preset_id} (${preset.display_name})`)
      .join(', ');
    return (
      `no calendar preset advertises a required time_offset offering ${OFFSET_SECONDS} ` +
      `seconds, so nothing can fire before a meeting starts. Served: ${served}`
    );
  }

  return {
    skip:
      `${usable.map((p) => p.preset_id).join(', ')} can fire ${OFFSET_SECONDS} seconds ahead, ` +
      'so the trigger will register. Everything past that needs a scheduled ' +
      'meeting and an enabled Cursor Automation — the delivery contract, the ' +
      'occurrence key, the window starting at the last brief, and no-movement ' +
      "kept distinct from no-data are asserted offline by the recipe's own npm " +
      'run verify:fixture, which CI runs.',
  };
}
