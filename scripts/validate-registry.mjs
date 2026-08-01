import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repoRoot = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'schemas', 'recipe.schema.json'), 'utf8'),
);
// Validate the per-recipe sources rather than the built registry.json, so a
// failure names the file an author actually edits.
const recipesDir = path.join(repoRoot, 'recipes');
const registry = fs
  .readdirSync(recipesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => path.join(recipesDir, dirent.name, 'recipe.json'))
  .filter((file) => fs.existsSync(file))
  .map((file) => ({
    file: path.relative(repoRoot, file),
    entry: JSON.parse(fs.readFileSync(file, 'utf8')),
  }))
  .sort((a, b) => a.entry.id.localeCompare(b.entry.id));

if (registry.length === 0) {
  console.error('No recipes/<id>/recipe.json files found.');
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

let failed = false;
const seenIds = new Set();

for (const { file, entry } of registry) {
  const label = entry?.id ?? file;

  if (!validate(entry)) {
    failed = true;
    console.error(`✗ ${file}: fails schemas/recipe.schema.json`);
    for (const err of validate.errors ?? []) {
      console.error(`    ${err.instancePath || '(root)'} ${err.message}`);
    }
    continue;
  }

  if (seenIds.has(entry.id)) {
    failed = true;
    console.error(`✗ ${file}: duplicate id "${entry.id}"`);
    continue;
  }
  seenIds.add(entry.id);

  const recipeDir = path.join(repoRoot, 'recipes', entry.id);
  if (!fs.existsSync(recipeDir) || !fs.statSync(recipeDir).isDirectory()) {
    failed = true;
    console.error(`✗ ${label}: no matching recipes/${entry.id}/ directory`);
    continue;
  }

  console.log(`✓ ${label}`);
}

if (failed) {
  process.exit(1);
}

console.log(
  `\n${registry.length} recipe ${registry.length === 1 ? 'file' : 'files'} valid.`,
);
