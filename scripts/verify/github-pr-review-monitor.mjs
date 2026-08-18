// Only the registration half is reachable here, and it is the half that fails in
// practice: plenty of deployments do not serve GitHub review presets. Delivery
// needs a tunnel, a real review request, and an interactive session, so those
// queries skip; the offline half is covered by the recipe's own fixture suite.

import { assertServes, triggerPresets } from '../verify-lib/triggers.mjs';

// Reads the preset catalog. No trigger is created and nothing is delivered.
export const sideEffects = 'read-only';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  ['GLEAN_SERVER_URL', 'GLEAN_INSTANCE'],
];

export async function setup() {
  return { presets: await triggerPresets() };
}

export async function run(query, { presets }) {
  if (query.startsWith('Request a review')) {
    const problem = assertServes(presets, 'github');
    if (problem) return problem;
    const ids = presets
      .filter((preset) => String(preset.datasource).toLowerCase() === 'github')
      .map((preset) => preset.preset_id);
    if (ids.length < 3) {
      return (
        `only ${ids.length} GitHub preset(s) served (${ids.join(', ')}). The recipe ` +
        `registers assignment, review-requested and ready-for-review together; a ` +
        `partial set looks like it worked and misses the events it did not cover.`
      );
    }
    return {
      skip:
        `${ids.length} GitHub presets are served (${ids.join(', ')}), so registration ` +
        `will succeed. Delivery needs a public tunnel and a real review request — ` +
        `run npm start, npm run setup, then request a review from yourself.`,
    };
  }
  return {
    skip:
      'needs a delivered event. The offline half — replay dedupe, the untrusted-' +
      'content boundary, and the absence of a submit path — is asserted by the ' +
      "recipe's own npm run verify:fixture, which CI runs.",
  };
}
