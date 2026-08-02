// `integrate` recipe: no code of ours to run, so this verifies the platform
// behaviour the recipe tells readers to build on. See scripts/verify-lib/platform.mjs
// for why that's the honest scope here.
import { assertCitedAnswer } from '../verify-lib/platform.mjs';

// Verifies the platform behaviour the recipe builds on; indexes nothing.
export const sideEffects = 'read-only';

export const requiredEnv = ['GLEAN_API_TOKEN', 'GLEAN_INSTANCE'];

export async function run(query) {
  return assertCitedAnswer(query);
}
