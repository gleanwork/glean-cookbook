#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { readJsonc } from './lib/jsonc.mjs';
import { runStepSequence, scaffoldOf } from './lib/step-shell.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesRoot = path.join(repoRoot, 'recipes');
const errors = [];

// Programs that do not depend on the project directory.
const CWD_INDEPENDENT = new Set(['cloudflared', 'curl']);

function commandLists(recipe) {
  return [
    ['steps', recipe.steps ?? []],
    ...(recipe.codeAssets ?? []).map((asset, index) => [
      `codeAssets[${index}].steps`,
      asset.steps ?? [],
    ]),
  ];
}

function insideProject(cwd, targets) {
  return targets.some(
    (target) => cwd === target || cwd.startsWith(`${target}/`),
  );
}

function checkScaffoldCommand(recipe, location, index, command) {
  if (!/\btiged@2\.12\.8\b/u.test(command)) {
    errors.push(
      `${recipe.id} ${location}[${index}] must pin tiged@2.12.8: ${command}`,
    );
  }
  if (!/^npx\s+-y\s+/u.test(command.trim())) {
    errors.push(
      `${recipe.id} ${location}[${index}] must use non-interactive npx -y: ${command}`,
    );
  }
}

function checkSequence(recipe, location, steps) {
  const scaffoldIndexes = [];
  for (const [index, step] of steps.entries()) {
    if (!step.command) {
      if (step.newTerminal) {
        errors.push(
          `${recipe.id} ${location}[${index}] sets newTerminal but has no command`,
        );
      }
      continue;
    }
    if (scaffoldOf(step.command)) {
      scaffoldIndexes.push(index);
      checkScaffoldCommand(recipe, location, index, step.command);
    }
  }
  // Only a downloaded project has a directory sequence to check.
  if (scaffoldIndexes.length === 0) return;

  const firstCommand = steps.findIndex((step) => step.command);
  if (steps[firstCommand]?.newTerminal) {
    errors.push(
      `${recipe.id} ${location}[${firstCommand}] cannot open a new terminal before any earlier command`,
    );
  }

  const { calls, failure } = runStepSequence({ repoRoot, steps });
  if (failure) {
    const step = `${recipe.id} ${location}[${failure.step}]`;
    if (failure.cd) {
      errors.push(
        `${step} runs \`cd ${failure.cd.to}\` from ${failure.cd.from}, where it does not exist: ${steps[failure.step].command}\n` +
          '  Numbered commands share one shell, so an earlier `cd` still applies. Remove the repeated `cd`, or set "newTerminal": true if the reader must open a new terminal for this step.',
      );
    } else {
      errors.push(
        `${step} fails in a shell (exit ${failure.status}): ${steps[failure.step]?.command}\n  ${failure.stderr}`,
      );
    }
    return;
  }

  const targets = scaffoldIndexes.map(
    (index) => scaffoldOf(steps[index].command).target,
  );
  const reported = new Set();
  for (const call of calls) {
    if (call.step <= scaffoldIndexes[0] || reported.has(call.step)) continue;
    if (scaffoldOf(steps[call.step].command)) continue;
    if (CWD_INDEPENDENT.has(call.program)) continue;
    if (insideProject(call.cwd, targets)) continue;
    reported.add(call.step);
    errors.push(
      `${recipe.id} ${location}[${call.step}] runs ${call.program} from ${call.cwd}, outside ${targets.join(' or ')}: ${steps[call.step].command}`,
    );
  }
}

for (const entry of fs.readdirSync(recipesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const recipeFile = path.join(recipesRoot, entry.name, 'recipe.json');
  if (!fs.existsSync(recipeFile)) continue;
  const recipe = readJsonc(recipeFile);
  for (const [location, steps] of commandLists(recipe)) {
    checkSequence(recipe, location, steps);
  }
}

if (errors.length > 0) {
  console.error('Unsafe recipe command sequences:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  'Recipe scaffold pins and step commands run in sequence from one shell.',
);
