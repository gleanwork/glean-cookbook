#!/usr/bin/env node
/**
 * Sign in to a Glean instance for verify runs.
 *
 *   node scripts/verify-login.mjs [recipe-id]
 *
 * Requests exactly the scopes the named recipe declares in `requiredScopes`, or
 * the union across every recipe when called with no argument -- one browser
 * visit instead of one per recipe. GLEAN_INSTANCE selects the instance.
 *
 * The resulting refresh token is cached outside the repo, so this is a one-time
 * step rather than something each verify run repeats.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJsonc } from './lib/jsonc.mjs';
import { backendUrl, oauthScopes } from './verify-lib/auth.mjs';
import { login } from './verify-lib/oauth.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipeId = process.argv[2];

function recipeAt(id) {
  return readJsonc(path.join(repoRoot, 'recipes', id, 'recipe.json'));
}

function allRecipes() {
  return fs
    .readdirSync(path.join(repoRoot, 'recipes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => recipeAt(entry.name));
}

let scopes;
if (recipeId) {
  scopes = oauthScopes(recipeAt(recipeId));
} else {
  scopes = [...new Set(allRecipes().flatMap(oauthScopes))];
}

if (!process.env.GLEAN_INSTANCE) {
  console.error('Set GLEAN_INSTANCE first, e.g. GLEAN_INSTANCE=acme');
  process.exit(1);
}

const backend = backendUrl();
console.log(`Requesting scopes: ${scopes.join(', ')}`);
await login(backend, scopes);
console.log(`\nSigned in to ${backend}. Verify runs will pick this up.`);
