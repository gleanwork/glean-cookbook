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
import fg from 'fast-glob';
import prettier from 'prettier';

import { materializeArtifacts } from './lib/artifacts.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesDir = path.join(repoRoot, 'recipes');
const registryFile = path.join(repoRoot, 'registry.json');

const check = process.argv.includes('--check');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const recipeFiles = await fg('*/recipe.json', {
  cwd: recipesDir,
  absolute: true,
});

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

/**
 * Demo queries, emitted next to any recipe that ships its own verify script.
 *
 * Those scripts run from a scaffolded copy -- `tiged` fetches a single
 * subdirectory, so recipe.json isn't there to read. Hardcoding the queries in
 * the script is what let company-answers/chat-api drift until it was still
 * asking "Who owns the payments-service catalog entry?", a question about a
 * fixture corpus that no longer exists and that no reader's instance can answer.
 * Generating the list keeps recipe.json the one source and makes drift a CI
 * failure rather than something a live run has to discover.
 */
const queryFiles = [];
for (const entry of entries) {
  const recipeDir = path.join(recipesDir, entry.id);
  const verifyScripts = await fg('**/scripts/verify.mjs', {
    cwd: recipeDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/.venv/**'],
  });
  for (const scriptPath of verifyScripts) {
    const target = path.join(path.dirname(scriptPath), 'demo-queries.json');
    queryFiles.push({
      file: target,
      contents: await prettier.format(
        JSON.stringify(entry.demoQueries.map((q) => q.query)),
        { ...(await prettier.resolveConfig(target)), filepath: target },
      ),
    });
  }
}

const outputs = [
  { group: 'registry', file: registryFile, content: Buffer.from(contents) },
  ...queryFiles.map(({ file, contents: queries }) => ({
    group: 'demo-queries',
    file,
    content: Buffer.from(queries),
  })),
];
const changes = await materializeArtifacts(outputs, { check });
if (check && changes.length > 0) {
  console.error('Generated registry artifacts are stale:');
  for (const { file } of changes) {
    console.error(`  ${path.relative(repoRoot, file)}`);
  }
  console.error('Run `npm run build:registry` and commit the result.');
  process.exit(1);
}

console.log(
  check
    ? `registry.json and demo queries are up to date (${entries.length} recipes).`
    : `Built registry.json and demo queries from ${entries.length} recipe files.`,
);
