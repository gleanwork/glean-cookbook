// The workflow runs inside the reader's own n8n, so the only thing verifiable
// here is the precondition: the deployment has to serve the Gong preset, or the
// workflow imports and activates cleanly and never fires. The rest of the
// contract runs offline in the recipe's own fixture suite.

import { assertServes, triggerPresets } from '../verify-lib/triggers.mjs';

// Reads the preset catalog. Nothing is created or written.
export const sideEffects = 'read-only';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  ['GLEAN_SERVER_URL', 'GLEAN_INSTANCE'],
];

export async function setup() {
  return { presets: await triggerPresets() };
}

export async function run(query, { presets }) {
  const problem = assertServes(presets, 'gong');
  if (problem) return problem;

  if (query.startsWith('Finish a Gong call')) {
    return {
      skip:
        'the Gong preset is served, so the trigger will register. The end-to-end ' +
        'path needs a real completed call and live Salesforce and Slack ' +
        'credentials — publish the workflow and complete a short call with ' +
        'yourself as a participant.',
    };
  }
  return {
    skip:
      "both refusals are asserted offline by the recipe's own npm run " +
      'verify:fixture, which drives the shipped Code nodes over recorded ' +
      'fixtures. Reaching them live means arranging a genuinely ambiguous ' +
      'account or an evidence-free call.',
  };
}
