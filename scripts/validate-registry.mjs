import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repoRoot = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'schemas', 'recipe.schema.json'), 'utf8'),
);
const registry = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'registry.json'), 'utf8'),
);

if (!Array.isArray(registry)) {
  console.error('registry.json must be a JSON array of recipe entries.');
  process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

let failed = false;
const seenIds = new Set();

for (const [index, entry] of registry.entries()) {
  const label = entry?.id ?? `entry[${index}]`;

  if (!validate(entry)) {
    failed = true;
    console.error(`✗ ${label}: fails schemas/recipe.schema.json`);
    for (const err of validate.errors ?? []) {
      console.error(`    ${err.instancePath || '(root)'} ${err.message}`);
    }
    continue;
  }

  if (seenIds.has(entry.id)) {
    failed = true;
    console.error(`✗ ${label}: duplicate id in registry.json`);
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
  `\n${registry.length} registry ${registry.length === 1 ? 'entry' : 'entries'} valid.`,
);
