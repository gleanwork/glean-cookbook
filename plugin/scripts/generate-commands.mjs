#!/usr/bin/env node

import path from 'node:path';

import fg from 'fast-glob';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
import prettier from 'prettier';

import { renderRecipeSkill } from './render-recipe-skill.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const pluginRoot = path.resolve(import.meta.dirname, '..');
const registryFile = path.join(repoRoot, 'registry.json');
const skillsDir = path.join(pluginRoot, 'shared', 'cookbook', 'skills');
const START_MARKER = '<!-- pluginpack-generated:recipes:start -->';
const END_MARKER = '<!-- pluginpack-generated:recipes:end -->';
const HAND_AUTHORED_SKILLS = new Set([
  'browse-cookbook',
  'cookbook-conventions',
]);

const listTemplate = Handlebars.compile(
  '{{#each this}}- **{{title}}** (`/cookbook:{{id}}`) — {{description}}\n{{/each}}',
  { noEscape: true },
);
const tableTemplate = Handlebars.compile(
  [
    '| Recipe | Level | Time | Build it |',
    '| --- | --- | --- | --- |',
    '{{#each this}}| **{{cell title}}** | {{cell level}} | {{cell timeEstimate}} | `/cookbook:{{id}}` |\n{{/each}}',
  ].join('\n'),
  { noEscape: true },
);
Handlebars.registerHelper('cell', (value) =>
  String(value).replace(/\|/g, '\\|'),
);

function replaceGeneratedBlock(existing, file, rendered) {
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${path.relative(repoRoot, file)} is missing its generated recipe markers`,
    );
  }
  return `${existing.slice(0, start + START_MARKER.length)}\n${rendered.trim()}\n${existing.slice(end)}`;
}

async function format(file, content) {
  return prettier.format(content, {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
}

async function desiredOutputs(registry) {
  const skills = await Promise.all(
    registry.map(async (recipe) => {
      const file = path.join(skillsDir, recipe.id, 'SKILL.md');
      return [file, await format(file, renderRecipeSkill(recipe))];
    }),
  );
  const pastePrompts = registry.flatMap((recipe) => {
    if (!recipe.pastePromptFile) return [];
    const src = path.join(
      repoRoot,
      'recipes',
      recipe.id,
      recipe.pastePromptFile,
    );
    const dest = path.join(skillsDir, recipe.id, recipe.pastePromptFile);
    return [[dest, fs.readFileSync(src, 'utf8')]];
  });
  const marked = await Promise.all(
    [
      [
        path.join(skillsDir, 'browse-cookbook', 'SKILL.md'),
        listTemplate(registry),
      ],
      [path.join(repoRoot, 'README.md'), tableTemplate(registry)],
    ].map(async ([file, block]) => [
      file,
      await format(
        file,
        replaceGeneratedBlock(await fs.readFile(file, 'utf8'), file, block),
      ),
    ]),
  );
  return new Map([...skills, ...pastePrompts, ...marked]);
}

async function existingGeneratedSkills() {
  const files = await fg('*/SKILL.md', { cwd: skillsDir, absolute: true });
  return files.filter(
    (file) => !HAND_AUTHORED_SKILLS.has(path.basename(path.dirname(file))),
  );
}

const check = process.argv.includes('--check');
const registry = await fs.readJson(registryFile);
if (!Array.isArray(registry)) throw new Error('registry.json must be an array');
const desired = await desiredOutputs(registry);
const existingSkills = await existingGeneratedSkills();
const stale = existingSkills.filter((file) => !desired.has(file));
const changed = [];

for (const [file, content] of desired) {
  const current = await fs.readFile(file, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (current === content) continue;
  changed.push(file);
  if (!check) await fs.outputFile(file, content);
}

if (!check) {
  await Promise.all(stale.map((file) => fs.remove(path.dirname(file))));
}

if (check && (changed.length > 0 || stale.length > 0)) {
  console.error('Generated plugin sources are stale:');
  for (const file of [...changed, ...stale]) {
    console.error(`  ${path.relative(repoRoot, file)}`);
  }
  console.error('Run `npm run build` and commit the result.');
  process.exit(1);
}

console.log(
  check
    ? `${registry.length} generated recipe skills are up to date.`
    : `Generated ${registry.length} recipe skills and shared recipe lists.`,
);
