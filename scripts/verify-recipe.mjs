#!/usr/bin/env node
/**
 * Live verification gate for one recipe.
 *
 *   node scripts/verify-recipe.mjs <recipe-id>
 *
 * Queries are read from recipes/<id>/recipe.json's `demoQueries` -- never
 * restated here. That field is the single source of truth for what a recipe
 * claims to answer, so adding a query to the registry adds it to verification,
 * and the two can't drift. `expectedBehavior` stays prose for humans; the
 * executable assertion for each query lives in scripts/verify/<id>.mjs, which
 * is the only per-recipe part.
 *
 * This tooling deliberately lives at repo level rather than inside
 * recipes/<id>/: a recipe directory is meant to work when copied out on its
 * own, and a maintainer's verification harness is not part of what a user
 * copies.
 *
 * Credentials are required, not optional -- a verify run that quietly skips is
 * worse than one that fails, because it reports success for an unverified
 * recipe. Missing environment fails before any query runs.
 *
 * A Client API credential comes from GLEAN_API_TOKEN if set, otherwise from an
 * OAuth token cached by @gleanwork/mcp-server-tester (see verify-lib/auth.mjs).
 * Modules keep reading process.env.GLEAN_API_TOKEN; this resolves it for them,
 * so no module needs to know which path produced it -- the same way a reader
 * doesn't.
 *
 * Pass --read-only to refuse any recipe whose verification writes to the
 * instance. Each module declares `sideEffects`:
 *
 *   'read-only'       search/chat calls only, saveChat off
 *   'agent-run'       invokes an existing agent; no content written, but the
 *                     run is recorded, and the agent had to be created by hand
 *   'indexes-content' uploads documents. No recipe declares this any more --
 *                     the one that did was retired to examples/sample-catalog,
 *                     since every recipe now reads content you already have.
 *                     Kept because a future recipe may need it.
 *
 * A module with no declaration is treated as writing, so forgetting to declare
 * fails closed rather than quietly passing the gate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loginCommand, resolveCredential } from './verify-lib/auth.mjs';
import { verificationExitCode } from './verify-lib/outcome.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const readOnly = args.includes('--read-only');
const recipeId = args.find((a) => !a.startsWith('--'));
if (!recipeId) {
  fail(
    'Usage: node scripts/verify-recipe.mjs <recipe-id> [--read-only]\n\n' +
      `Recipes with a verify module: ${listVerifiable().join(', ')}`,
  );
}

function listVerifiable() {
  const dir = path.join(repoRoot, 'scripts', 'verify');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => f.replace(/\.mjs$/, ''))
    .sort();
}

const recipeFile = path.join(repoRoot, 'recipes', recipeId, 'recipe.json');
if (!fs.existsSync(recipeFile)) {
  fail(`No recipe at recipes/${recipeId}/recipe.json`);
}
const recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8'));

const modulePath = path.join(repoRoot, 'scripts', 'verify', `${recipeId}.mjs`);
if (!fs.existsSync(modulePath)) {
  // A third-party-build recipe's app is built and run by Lovable or Replit, so
  // there is nothing of ours to drive. Say so, rather than implying someone
  // forgot to write a module.
  if (recipe.buildMethod === 'third-party-build') {
    fail(
      `${recipeId} has buildMethod "third-party-build": the app is built and run ` +
        `by a third-party tool, so it cannot be verified from here.\n\n` +
        `Verify it by hand: paste the recipe's prompt into that tool, then run ` +
        `each demoQuery in the built app and check its expectedBehavior:\n` +
        (recipe.demoQueries ?? [])
          .map((q) => `  "${q.query}"\n    expect: ${q.expectedBehavior}`)
          .join('\n'),
    );
  }
  fail(
    `No verify module at scripts/verify/${recipeId}.mjs.\n` +
      `Recipes with one: ${listVerifiable().join(', ') || '(none)'}`,
  );
}
const mod = await import(modulePath);

if (typeof mod.run !== 'function') {
  fail(`scripts/verify/${recipeId}.mjs must export: run(query, context)`);
}

// Default to 'writes' for an undeclared module: a missing declaration is
// indistinguishable from an unaudited one, and guessing 'read-only' would let
// exactly the run this flag exists to prevent through.
const sideEffects = mod.sideEffects ?? 'writes';
if (readOnly && sideEffects !== 'read-only') {
  fail(
    `${recipeId} declares sideEffects "${sideEffects}", so it cannot run under ` +
      `--read-only.\n\nRecipes verifiable without touching the instance: ` +
      `${(await listReadOnly()).join(', ')}`,
  );
}

async function listReadOnly() {
  const ids = [];
  for (const id of listVerifiable()) {
    const m = await import(
      path.join(repoRoot, 'scripts', 'verify', `${id}.mjs`)
    );
    if (m.sideEffects === 'read-only') ids.push(id);
  }
  return ids;
}

const queries = recipe.demoQueries ?? [];
if (queries.length === 0) {
  fail(
    `recipes/${recipeId}/recipe.json has no demoQueries — nothing to verify. ` +
      `Add them there rather than to this harness.`,
  );
}

// Resolve a Client API credential before the environment gate below, so a
// module that lists GLEAN_API_TOKEN is satisfied by an OAuth login just as well
// as by an exported token.
if (
  (mod.requiredEnv ?? []).includes('GLEAN_API_TOKEN') &&
  !process.env.GLEAN_API_TOKEN
) {
  try {
    const { token, source } = await resolveCredential(recipe);
    process.env.GLEAN_API_TOKEN = token;
    console.log(`credential: ${source}`);
  } catch (error) {
    fail(error.message);
  }
}

// Each module declares the environment its recipe genuinely needs, so the run
// stops with a list of what to set instead of failing mid-query on an
// undefined token. An entry may be an array of alternatives, for a recipe that
// accepts either of two variables -- listing both as separate entries would
// demand both.
const missing = (mod.requiredEnv ?? [])
  .map((entry) =>
    Array.isArray(entry)
      ? entry.some((name) => process.env[name])
        ? null
        : entry.join(' or ')
      : process.env[entry]
        ? null
        : entry,
  )
  .filter(Boolean);
if (missing.length > 0) {
  fail(
    `${recipeId} needs environment that isn't set:\n` +
      missing.map((n) => `  ${n}`).join('\n') +
      `\n\nThis gate verifies against a live Glean instance; there is no ` +
      `offline mode, because a skipped check reads as a pass.` +
      (missing.some((n) => n.includes('GLEAN_INSTANCE'))
        ? ''
        : `\n\nFor a Client API credential you can also sign in once:\n  ` +
          `${loginCommand(recipe)}`),
  );
}

const context = { recipeId, recipe, repoRoot };
if (typeof mod.setup === 'function') {
  try {
    Object.assign(context, (await mod.setup(context)) ?? {});
  } catch (error) {
    fail(`setup failed for ${recipeId}: ${error.message}`);
  }
}

let failed = 0;
const skipped = [];
try {
  for (const { query, expectedBehavior } of queries) {
    try {
      // A module returns null/undefined on success, a string explaining
      // precisely which promised behavior did not hold, or { skip: reason } for
      // a check this environment genuinely cannot exercise (a second user, an
      // agent id you don't have). Skips are never silent: a run that skipped
      // anything says so in the summary, because reporting a partial run as a
      // pass is how an unverified recipe ends up with a lastVerified date.
      const problem = await mod.run(query, context);
      if (problem && typeof problem === 'object' && problem.skip) {
        skipped.push({ query, reason: problem.skip });
        console.log(`skip "${query}"\n      ${problem.skip}`);
      } else if (problem) {
        failed += 1;
        console.error(`FAIL "${query}"\n      ${problem}`);
        console.error(`      expected: ${expectedBehavior}`);
      } else {
        console.log(`ok   "${query}"`);
      }
    } catch (error) {
      failed += 1;
      console.error(`FAIL "${query}"\n      threw: ${error.message}`);
    }
  }
} finally {
  if (typeof mod.teardown === 'function') {
    try {
      await mod.teardown(context);
    } catch (error) {
      console.error(`(teardown warning: ${error.message})`);
    }
  }
}

const exitCode = verificationExitCode({
  failed,
  skipped: skipped.length,
});

if (exitCode === 1) {
  console.error(
    `\n${failed} of ${queries.length} demo queries failed for ${recipeId}.`,
  );
  process.exit(exitCode);
}

if (exitCode === 2) {
  console.log(
    `\n${queries.length - skipped.length} of ${queries.length} demo queries passed for ${recipeId}; ${skipped.length} skipped:`,
  );
  for (const { query, reason } of skipped) {
    console.log(`  - "${query}": ${reason}`);
  }
  console.log(
    `\nThis is a PARTIAL verification. Do not set lastVerified from it without\nexercising the skipped checks another way.`,
  );
  process.exit(exitCode);
} else {
  console.log(`\nAll ${queries.length} demo queries passed for ${recipeId}.`);
}
