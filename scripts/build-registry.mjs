#!/usr/bin/env node
/**
 * Builds registry.json from the per-recipe recipes/<id>/recipe.json files.
 *
 * Recipe metadata is authored next to the code it describes, one file per
 * recipe, so adding a recipe touches its own directory instead of a single
 * 800-line file that two in-flight branches both edit.
 *
 * registry.json stays committed rather than gitignored: the dev site syncs it
 * as one fetch (scripts/sync-registry.mjs), and the published plugin's skills
 * are generated from it. Being generated and committed, it needs the same
 * drift guard as the other generated artifacts here.
 *
 * Usage:
 *   node scripts/build-registry.mjs          # write
 *   node scripts/build-registry.mjs --check  # fail if stale (CI)
 */

import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesDir = path.join(repoRoot, 'recipes');
const registryFile = path.join(repoRoot, 'registry.json');

const check = process.argv.includes('--check');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const recipeFiles = fs
  .readdirSync(recipesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => path.join(recipesDir, dirent.name, 'recipe.json'))
  .filter((file) => fs.existsSync(file));

if (recipeFiles.length === 0) {
  fail(`No recipes/<id>/recipe.json files found under ${recipesDir}.`);
}

const entries = recipeFiles
  .map((file) => {
    const rel = path.relative(repoRoot, file);
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      fail(`${rel}: not valid JSON — ${error.message}`);
    }
    const expectedId = path.basename(path.dirname(file));
    if (entry.id !== expectedId) {
      fail(
        `${rel}: declares id "${entry.id}" but lives in recipes/${expectedId}/. ` +
          `The directory name is the id.`,
      );
    }
    return entry;
  })
  // Sort by id so the built file has a stable order regardless of how the
  // filesystem hands back directory entries.
  .sort((a, b) => a.id.localeCompare(b.id));

// Format through prettier rather than raw JSON.stringify: registry.json is
// committed and covered by `format:check`, and a build that emitted a
// different style would leave that check and this one contradicting.
const contents = await prettier.format(JSON.stringify(entries), {
  ...(await prettier.resolveConfig(registryFile)),
  filepath: registryFile,
});

/**
 * An id in the committed registry with no recipes/<id>/recipe.json behind it
 * is almost always a branch written before the split — someone added an entry
 * to registry.json directly, then merged main. Rebuilding would delete their
 * recipe, and the stale-check's own message tells them to run exactly that.
 * Refuse instead, unless the removal is stated explicitly.
 */
const existingRaw = fs.existsSync(registryFile)
  ? fs.readFileSync(registryFile, 'utf8')
  : '';
if (existingRaw.trim()) {
  const builtIds = new Set(entries.map((entry) => entry.id));
  let previousIds = [];
  try {
    previousIds = JSON.parse(existingRaw).map((entry) => entry.id);
  } catch {
    // Unparseable registry: nothing to protect, the rebuild replaces it.
  }
  const dropped = previousIds.filter((id) => !builtIds.has(id));
  if (dropped.length > 0 && !process.argv.includes('--allow-removals')) {
    fail(
      `registry.json contains ${dropped.length} recipe(s) with no recipes/<id>/recipe.json:\n` +
        dropped.map((id) => `  ${id}`).join('\n') +
        `\n\nRecipe metadata now lives in recipes/<id>/recipe.json (registry.json is built\n` +
        `from it). If this is a branch written before that change, move each entry out of\n` +
        `registry.json into its own recipe.json and re-run. If you really are deleting\n` +
        `these recipes, re-run with --allow-removals.`,
    );
  }
}

if (check) {
  if (existingRaw !== contents) {
    console.error(
      'registry.json is stale. Run `npm run build:registry` and commit the result.',
    );
    process.exit(1);
  }
  console.log(`registry.json is up to date (${entries.length} recipes).`);
} else {
  fs.writeFileSync(registryFile, contents);
  console.log(`Wrote registry.json from ${entries.length} recipe file(s).`);
}
