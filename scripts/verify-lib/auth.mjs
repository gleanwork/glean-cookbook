// Resolves a Client API credential for a verify run, without this repo owning
// any OAuth code.
//
// Glean's recipes tell readers OAuth is the primary path and a Glean-issued
// token is the fallback, so a harness that only accepted a static token would
// verify the lesser of the two. The flow itself lives in ./oauth.mjs, which
// explains why it's implemented here rather than borrowed.
//
// Precedence, matching what a reader would experience:
//   1. GLEAN_API_TOKEN, if set  -- the documented fallback, and what CI uses
//   2. a cached OAuth token, refreshed if it has expired
//   3. neither: fail with the exact login command, requesting the scopes this
//      specific recipe declares it needs

import { storedToken } from './oauth.mjs';

export function backendUrl(instance = process.env.GLEAN_INSTANCE) {
  if (!instance) throw new Error('GLEAN_INSTANCE is not set');
  return `https://${instance}-be.glean.com`;
}

/**
 * The OAuth scopes for a recipe, from its own `requiredScopes`.
 *
 * Derived rather than hardcoded so a recipe that starts needing another scope
 * doesn't need this file edited too. Glean's authorization server advertises
 * these lowercased; INDEXING is deliberately absent from that list, since
 * Indexing API operations accept Glean-issued tokens only regardless of tenant
 * OAuth configuration.
 */
export function oauthScopes(recipe) {
  const scopes = (recipe.requiredScopes ?? [])
    .map((s) => s.toLowerCase())
    .filter((s) => s !== 'indexing');
  // offline_access buys a refresh token, so the browser step is once rather
  // than once per token lifetime.
  return [...new Set([...scopes, 'offline_access'])];
}

export function loginCommand(recipe) {
  return `GLEAN_INSTANCE=${process.env.GLEAN_INSTANCE ?? '<instance>'} node scripts/verify-login.mjs ${recipe.id}`;
}

/**
 * Returns { token, source }. Throws with actionable instructions if neither
 * path yields a credential -- never returns empty, since a verify run without a
 * credential reports failure for reasons that have nothing to do with the
 * recipe.
 */
export async function resolveCredential(
  recipe,
  instance = process.env.GLEAN_INSTANCE,
) {
  if (process.env.GLEAN_API_TOKEN) {
    return { token: process.env.GLEAN_API_TOKEN, source: 'GLEAN_API_TOKEN' };
  }

  const token = await storedToken(backendUrl(instance));
  if (token) return { token, source: 'cached OAuth token' };

  throw new Error(
    `No Glean credential available for ${recipe.id}.\n\n` +
      `Either export GLEAN_API_TOKEN with the ${(recipe.requiredScopes ?? []).join(' + ')} ` +
      `scope(s), or sign in once with:\n\n  ${loginCommand(recipe)}\n\n` +
      `That opens a browser, runs authorization-code + PKCE against your ` +
      `instance, and caches a refresh token, so later runs need no browser.`,
  );
}
