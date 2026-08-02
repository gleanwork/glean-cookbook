// Resolves a Client API credential for a verify run, without this repo owning
// any OAuth code.
//
// Glean's recipes tell readers OAuth is the primary path and a Glean-issued
// token is the fallback, so a harness that only accepted a static token would
// verify the lesser of the two. The authorization-code + PKCE flow is already
// implemented, tested, and published in @gleanwork/mcp-server-tester, which
// exposes it as `login` and `token` subcommands. We shell out to those the same
// way this harness already shells out to `uv` and `tiged`, rather than adding a
// dependency: that package pulls ~350MB (its eval/judge feature bundles the
// Anthropic SDK and Playwright), none of which a credential lookup needs.
//
// Precedence, matching what a reader would experience:
//   1. GLEAN_API_TOKEN, if set  -- the documented fallback, and what CI uses
//   2. a token already cached by that CLI's OAuth flow
//   3. neither: fail with the exact login command to run, including the scopes
//      this specific recipe declares it needs

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PACKAGE = '@gleanwork/mcp-server-tester';

/** `MCP_ACCESS_TOKEN=...` as printed by `token --format env`. */
const ENV_LINE = /^MCP_ACCESS_TOKEN=(.+)$/m;

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

export function loginCommand(recipe, instance) {
  const scopes = oauthScopes(recipe).join(',');
  return `npx -y ${PACKAGE} login ${backendUrl(instance)} --scopes ${scopes}`;
}

async function cachedToken(instance) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'npx',
      ['-y', PACKAGE, 'token', backendUrl(instance), '--format', 'env'],
      { maxBuffer: 4 * 1024 * 1024 },
    ));
  } catch {
    // No cache, no network, package unavailable -- all mean "no token here",
    // and the caller's error names the fix.
    return null;
  }
  // Parse rather than trust the exit code: as of 1.1.1 `token` exits 0 when no
  // token is stored, printing a "not found" notice instead. A script that took
  // the exit code at face value would run with no credential and read a skipped
  // check as a pass.
  return stdout.match(ENV_LINE)?.[1]?.trim() || null;
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

  const token = await cachedToken(instance);
  if (token) return { token, source: `${PACKAGE} OAuth cache` };

  throw new Error(
    `No Glean credential available for ${recipe.id}.\n\n` +
      `Either export GLEAN_API_TOKEN with the ${(recipe.requiredScopes ?? []).join(' + ')} ` +
      `scope(s), or sign in once with:\n\n  ${loginCommand(recipe, instance)}\n\n` +
      `That opens a browser, runs authorization-code + PKCE against your ` +
      `instance, and caches a refresh token, so later runs need no browser.`,
  );
}
