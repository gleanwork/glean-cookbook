import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fg from 'fast-glob';

import { readJsonc } from './lib/jsonc.mjs';
import { extractPastePrompt } from './lib/paste-prompt.mjs';
import { materializeCodeWalkthrough } from './lib/code-walkthrough.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'schemas', 'recipe.schema.json'), 'utf8'),
);
const taxonomy = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'config', 'recipe-taxonomy.json'),
    'utf8',
  ),
);
const executionTypes = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'config', 'execution-types.json'),
    'utf8',
  ),
);
const schemaExecutionTypes = schema.$defs.execution.properties.type.enum;
if (
  JSON.stringify([...schemaExecutionTypes].sort()) !==
  JSON.stringify(Object.keys(executionTypes).sort())
) {
  console.error(
    'schemas/recipe.schema.json and config/execution-types.json declare different execution types.',
  );
  process.exit(1);
}

function validateTaxonomyDimension(name) {
  const entries = taxonomy[name];
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error(
      `config/recipe-taxonomy.json: ${name} must be a non-empty array.`,
    );
    process.exit(1);
  }

  const ids = entries.map((entry) => entry?.id);
  const labels = entries.map((entry) => entry?.label);
  if (
    ids.some((id) => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) ||
    labels.some((label) => typeof label !== 'string' || label.trim() === '')
  ) {
    console.error(
      `config/recipe-taxonomy.json: every ${name} entry needs a kebab-case id and non-empty label.`,
    );
    process.exit(1);
  }
  if (new Set(ids).size !== ids.length) {
    console.error(
      `config/recipe-taxonomy.json: ${name} contains duplicate ids.`,
    );
    process.exit(1);
  }

  const schemaValues = schema.properties[name].items.enum;
  if (JSON.stringify(ids) !== JSON.stringify(schemaValues)) {
    console.error(
      `config/recipe-taxonomy.json and schemas/recipe.schema.json declare different ${name}.`,
    );
    process.exit(1);
  }
}

validateTaxonomyDimension('capabilities');
validateTaxonomyDimension('surfaces');
// Validate the per-recipe sources rather than the built registry.json, so a
// failure names the file an author actually edits.
const recipesDir = path.join(repoRoot, 'recipes');
const registry = fg
  .sync('*/recipe.json', { cwd: recipesDir, absolute: true })
  .map((file) => ({
    file: path.relative(repoRoot, file),
    entry: readJsonc(file),
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
const MAX_PREVIEW_BYTES = 200 * 1024;

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

  try {
    materializeCodeWalkthrough(entry, recipeDir);
  } catch (error) {
    failed = true;
    console.error(`✗ ${label}: ${error.message}`);
    continue;
  }

  if (entry.preview) {
    const previewFile = path.resolve(repoRoot, entry.preview.path);
    const expectedRoot = `${path.resolve(recipeDir, 'assets')}${path.sep}`;
    if (!previewFile.startsWith(expectedRoot)) {
      failed = true;
      console.error(
        `✗ ${label}: preview.path must stay inside recipes/${entry.id}/assets/`,
      );
      continue;
    }
    if (!fs.existsSync(previewFile) || !fs.statSync(previewFile).isFile()) {
      failed = true;
      console.error(
        `✗ ${label}: preview asset does not exist: ${entry.preview.path}`,
      );
      continue;
    }
    const preview = fs.readFileSync(previewFile);
    const isWebp =
      preview.length >= 12 &&
      preview.subarray(0, 4).toString('ascii') === 'RIFF' &&
      preview.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isWebp) {
      failed = true;
      console.error(`✗ ${label}: preview asset must be a WebP file`);
      continue;
    }
    if (preview.length > MAX_PREVIEW_BYTES) {
      failed = true;
      console.error(
        `✗ ${label}: preview asset is ${Math.ceil(preview.length / 1024)} KB; maximum is 200 KB`,
      );
      continue;
    }
  }

  if (entry.pastePrompt) {
    failed = true;
    console.error(
      `✗ ${label}: pastePrompt is generated into registry.json; set pastePromptFile instead`,
    );
    continue;
  }

  if (Boolean(entry.pasteTarget) !== Boolean(entry.pastePromptFile)) {
    failed = true;
    console.error(
      `✗ ${label}: pasteTarget and pastePromptFile must be set together`,
    );
    continue;
  }

  if (entry.pastePromptFile) {
    if (path.basename(entry.pastePromptFile) !== entry.pastePromptFile) {
      failed = true;
      console.error(
        `✗ ${label}: pastePromptFile must be a file in the recipe directory`,
      );
      continue;
    }
    const promptFile = path.join(recipeDir, entry.pastePromptFile);
    if (!fs.existsSync(promptFile) || !fs.statSync(promptFile).isFile()) {
      failed = true;
      console.error(
        `✗ ${label}: pastePromptFile does not exist: ${entry.pastePromptFile}`,
      );
      continue;
    }
    if (extractPastePrompt(fs.readFileSync(promptFile, 'utf8')) == null) {
      failed = true;
      console.error(
        `✗ ${label}: ${entry.pastePromptFile} needs a four-backtick text fence for the docs copy button`,
      );
      continue;
    }
  }

  console.log(`✓ ${label}`);
}

if (failed) {
  process.exit(1);
}

console.log(
  `\n${registry.length} recipe ${registry.length === 1 ? 'file' : 'files'} valid.`,
);
