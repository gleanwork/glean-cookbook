#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { readJsonc } from './lib/jsonc.mjs';

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

function parseScaffold(command) {
  if (!/\btiged(?:@\S+)?\b/.test(command)) return undefined;
  const firstCommand = command.split(/\r?\n|&&/u, 1)[0];
  return {
    target: firstCommand.trim().split(/\s+/).at(-1),
    // Keep the remaining shell text intact, including any persistent cd.
    remaining: command.slice(firstCommand.length).replace(/^(?:\s|&&)+/u, ''),
  };
}

function runsFromTarget(command, target) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^\\(?\\s*cd\\s+(?:["']?${escaped}["']?)(?:/[^&;]+)?\\s*(?:&&|\\r?\\n|$)`,
  ).test(command.trim());
}

function isExplicitlyCwdIndependent(command) {
  return /^(?:cloudflared|curl)\b/.test(command.trim());
}

for (const entry of fs.readdirSync(recipesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const recipeFile = path.join(recipesRoot, entry.name, 'recipe.json');
  if (!fs.existsSync(recipeFile)) continue;
  const recipe = readJsonc(recipeFile);

  for (const [location, steps] of commandLists(recipe)) {
    let target;
    let enteredTarget = false;
    for (const [index, step] of steps.entries()) {
      if (!step.command) continue;
      let command = step.command;
      const scaffold = parseScaffold(command);
      if (scaffold?.target) {
        target = scaffold.target;
        enteredTarget = false;
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
        command = scaffold.remaining;
      }
      if (!command || !target || isExplicitlyCwdIndependent(command)) continue;
      if (runsFromTarget(command, target)) {
        // A normal cd persists across the documented steps; a subshell does not.
        if (!command.trim().startsWith('(')) enteredTarget = true;
      } else if (!enteredTarget) {
        errors.push(
          `${recipe.id} ${location}[${index}] must enter ${target} before running project commands: ${step.command}`,
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

console.log('Recipe scaffold pins and initial working directories are valid.');
