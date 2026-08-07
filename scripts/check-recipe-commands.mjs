#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesRoot = path.join(repoRoot, 'recipes');
const errors = [];

function commandLists(recipe) {
  return [
    ['steps', recipe.steps ?? []],
    ...(recipe.codeAssets ?? []).map((asset, index) => [
      `codeAssets[${index}].steps`,
      asset.steps ?? [],
    ]),
  ];
}

function scaffoldTarget(command) {
  if (!/\btiged(?:@\S+)?\b/.test(command)) return undefined;
  return command.trim().split(/\s+/).at(-1);
}

function runsFromTarget(command, target) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^\\(?\\s*cd\\s+(?:["']?${escaped}["']?)(?:/[^&;]+)?\\s*&&`,
  ).test(command.trim());
}

function isExplicitlyCwdIndependent(command) {
  return /^(?:cloudflared|curl)\b/.test(command.trim());
}

for (const entry of fs.readdirSync(recipesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const recipeFile = path.join(recipesRoot, entry.name, 'recipe.json');
  if (!fs.existsSync(recipeFile)) continue;
  const recipe = JSON.parse(fs.readFileSync(recipeFile, 'utf8'));

  for (const [location, steps] of commandLists(recipe)) {
    let target;
    for (const [index, step] of steps.entries()) {
      if (!step.command) continue;
      const nextTarget = scaffoldTarget(step.command);
      if (nextTarget) {
        target = nextTarget;
        if (!/\btiged@2\.12\.8\b/.test(step.command)) {
          errors.push(
            `${recipe.id} ${location}[${index}] must pin tiged@2.12.8: ${step.command}`,
          );
        }
        if (!/^npx\s+-y\s+/.test(step.command.trim())) {
          errors.push(
            `${recipe.id} ${location}[${index}] must use non-interactive npx -y: ${step.command}`,
          );
        }
        continue;
      }
      if (
        target &&
        !isExplicitlyCwdIndependent(step.command) &&
        !runsFromTarget(step.command, target)
      ) {
        errors.push(
          `${recipe.id} ${location}[${index}] must run from ${target} independently: ${step.command}`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Unsafe recipe command sequences:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Recipe commands are pinned and independently cwd-safe.');
