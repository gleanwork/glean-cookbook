#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesRoot = path.join(repoRoot, 'recipes');
const skillsRoot = path.join(
  repoRoot,
  'plugin',
  'plugins',
  'cookbook',
  'skills',
);
const errors = [];

function targetFor(recipe, execution) {
  const assets = recipe.codeAssets ?? [];
  if (assets.length === 1) return assets[0].repoPath;
  const command = execution.auth
    .map((auth) => auth.setupCommand ?? '')
    .join(' ');
  return assets.find((asset) =>
    command.includes(asset.repoPath.split('/').at(-1)),
  )?.repoPath;
}

function checkExecution(recipe, execution, steps, location, repoPath) {
  for (const auth of execution.auth) {
    if (
      auth.kind === 'oauth-with-token-fallback' &&
      !/\b(?:npm run login|glean-auth\.mjs login)\b/u.test(
        auth.setupCommand ?? '',
      )
    ) {
      errors.push(
        `${recipe.id} ${location}: OAuth auth has no shipped login command`,
      );
    }
    if (auth.kind === 'browser-cookie' && execution.run?.userBrowser !== true) {
      errors.push(
        `${recipe.id} ${location}: browser-cookie auth must hand off to the user's browser`,
      );
    }
  }

  if (execution.verification.startsOwnServer) {
    const verifyIndex = steps.findIndex((step) => step.kind === 'verify-live');
    const runIndex = steps.findIndex((step) => step.kind === 'run');
    if (verifyIndex === -1 || (runIndex !== -1 && verifyIndex > runIndex)) {
      errors.push(
        `${recipe.id} ${location}: self-starting verification must run before the persistent app`,
      );
    }
  }

  const target = repoPath ?? targetFor(recipe, execution);
  if (!target) return;
  const absoluteTarget = path.join(repoRoot, target);
  if (
    execution.auth.some((auth) => auth.kind === 'oauth-with-token-fallback')
  ) {
    if (
      !fs.existsSync(path.join(absoluteTarget, 'scripts', 'glean-auth.mjs'))
    ) {
      errors.push(
        `${recipe.id} ${location}: scaffold does not ship scripts/glean-auth.mjs`,
      );
    }
  }
  const gitignore = fs.existsSync(path.join(absoluteTarget, '.gitignore'))
    ? fs.readFileSync(path.join(absoluteTarget, '.gitignore'), 'utf8')
    : '';
  for (const auth of execution.auth) {
    if (auth.configFile?.startsWith('.env') && !gitignore.includes('.env')) {
      errors.push(
        `${recipe.id} ${location}: ${auth.configFile} is not ignored`,
      );
    }
    if (!auth.credentialVariable) continue;
    const example = path.join(absoluteTarget, '.env.example');
    if (
      fs.existsSync(example) &&
      !new RegExp(`^${auth.credentialVariable}=`, 'mu').test(
        fs.readFileSync(example, 'utf8'),
      )
    ) {
      errors.push(
        `${recipe.id} ${location}: .env.example omits ${auth.credentialVariable}`,
      );
    }
  }
}

for (const entry of fs.readdirSync(recipesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(recipesRoot, entry.name, 'recipe.json');
  if (!fs.existsSync(file)) continue;
  const recipe = JSON.parse(fs.readFileSync(file, 'utf8'));
  const contracts = [];
  if (recipe.execution) {
    contracts.push({
      execution: recipe.execution,
      steps: recipe.steps ?? [],
      location: 'execution',
    });
  }
  for (const [index, asset] of (recipe.codeAssets ?? []).entries()) {
    if (!asset.execution) continue;
    contracts.push({
      execution: asset.execution,
      steps: asset.steps ?? [],
      location: `codeAssets[${index}].execution`,
      repoPath: asset.repoPath,
    });
  }
  if (contracts.length === 0)
    errors.push(`${recipe.id}: no execution contract`);
  for (const contract of contracts) {
    checkExecution(
      recipe,
      contract.execution,
      contract.steps,
      contract.location,
      contract.repoPath,
    );
  }
  for (const step of [
    ...(recipe.steps ?? []),
    ...(recipe.codeAssets ?? []).flatMap((asset) => asset.steps ?? []),
  ]) {
    if (!step.kind)
      errors.push(`${recipe.id}: step "${step.title}" has no kind`);
  }

  const skill = path.join(skillsRoot, recipe.id, 'SKILL.md');
  if (fs.existsSync(skill)) {
    const words = fs.readFileSync(skill, 'utf8').trim().split(/\s+/u).length;
    if (words > 650)
      errors.push(`${recipe.id}: generated skill is ${words} words (max 650)`);
  }
}

if (errors.length > 0) {
  console.error(
    `Recipe execution contract failures:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
  process.exit(1);
}

console.log('Recipe execution contracts are complete and customer-runnable.');
