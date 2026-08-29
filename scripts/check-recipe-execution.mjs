#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

import { readJsonc } from './lib/jsonc.mjs';
import { hasRecipeOwnedOAuth } from './lib/oauth-entrypoint.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesRoot = path.join(repoRoot, 'recipes');
const skillsRoot = path.join(
  repoRoot,
  'plugin',
  'plugins',
  'cookbook',
  'skills',
);
const partialsRoot = path.join(repoRoot, 'plugin', 'partials');
const executionTypes = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'config', 'execution-types.json'),
    'utf8',
  ),
);
const errors = [];

function runHandoffPartial(execution) {
  const descriptor = executionTypes[execution.type];
  return execution.auth.some((auth) => auth.kind === 'browser-cookie')
    ? descriptor?.browserCookieHandoffPartial
    : descriptor?.handoffPartial;
}

function checkPartialReference(skillText, partial, recipeId) {
  if (!fs.existsSync(path.join(partialsRoot, `${partial}.md`))) {
    errors.push(`${recipeId}: shared partial ${partial}.md does not exist`);
  }
  if (!skillText.includes(`{{> ${partial}}}`)) {
    errors.push(`${recipeId}: generated skill omits {{> ${partial}}}`);
  }
}

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
  const target = repoPath ?? targetFor(recipe, execution);
  const runStep = steps.find((step) => step.kind === 'run');
  const fixtureStep = steps.find((step) => step.kind === 'verify-fixture');

  if (!executionTypes[execution.type]) {
    errors.push(`${recipe.id} ${location}: unknown execution type`);
    return;
  }

  if (execution.type === 'local-web') {
    if (!runStep) {
      errors.push(`${recipe.id} ${location}: local-web requires a run step`);
    }
    if (
      /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?$/u.test(
        execution.run?.url ?? '',
      )
    ) {
      errors.push(
        `${recipe.id} ${location}: local-web must report the URL printed after choosing an available port, not encode a localhost port`,
      );
    }
  } else if (execution.type === 'cli') {
    if (!runStep) {
      errors.push(`${recipe.id} ${location}: cli requires a run step`);
    }
  } else if (execution.type === 'host-configuration') {
    if (!steps.some((step) => step.kind === 'configure') || !runStep) {
      errors.push(
        `${recipe.id} ${location}: host-configuration requires configure and host restart/reload steps`,
      );
    }
  } else if (execution.type === 'external-builder') {
    if (recipe.buildMethod !== 'third-party-build') {
      errors.push(
        `${recipe.id} ${location}: external-builder must use third-party-build`,
      );
    }
  } else if (execution.type === 'hybrid-service') {
    if (
      !runStep ||
      !steps.some((step) => ['manual', 'handoff'].includes(step.kind))
    ) {
      errors.push(
        `${recipe.id} ${location}: hybrid-service requires both runnable and manual handoff steps`,
      );
    }
  }

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
  }
  if (
    execution.run?.command &&
    runStep?.command &&
    execution.run.command !== runStep.command
  ) {
    errors.push(
      `${recipe.id} ${location}: execution.run command differs from the run step`,
    );
  }

  if (fixtureStep) {
    const modeQuestion = (execution.questions ?? []).find((question) =>
      /\b(?:demo|fixture)\b/iu.test(question.prompt),
    );
    if (modeQuestion) {
      errors.push(
        `${recipe.id} ${location}: demo availability must come from GLEAN_COOKBOOK_DEMO, not a setup question`,
      );
    }
    // An `existing-app` recipe runs inside software the user already operates, so
    // it has no run command to name.
    if (
      execution.type !== 'existing-app' &&
      (!execution.run?.command || !execution.run?.url)
    ) {
      errors.push(
        `${recipe.id} ${location}: fixture-backed demo must declare a persistent run command and URL`,
      );
    }
    if (target) {
      const packageFile = path.join(repoRoot, target, 'package.json');
      const scripts = fs.existsSync(packageFile)
        ? (JSON.parse(fs.readFileSync(packageFile, 'utf8')).scripts ?? {})
        : {};
      const demoEntry = path.join(repoRoot, target, 'scripts', 'demo.mjs');
      const demoSource = fs.existsSync(demoEntry)
        ? fs.readFileSync(demoEntry, 'utf8')
        : '';
      // The demo entry point is environment-gated, not a particular runtime: a
      // zero-dependency JavaScript recipe needs plain node, not tsx.
      const demoEntryPoints = new Set([
        'node scripts/demo.mjs',
        'node --import tsx scripts/demo.mjs',
      ]);
      if (
        !demoEntryPoints.has(scripts.demo) ||
        !demoSource.includes("process.env.GLEAN_COOKBOOK_DEMO = 'true'") ||
        !demoSource.includes("process.env.GLEAN_USE_FIXTURE = 'true'")
      ) {
        errors.push(
          `${recipe.id} ${location}: fixture-backed recipe must ship the quiet, environment-gated demo entry point`,
        );
      }
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

  if (!target) return;
  const absoluteTarget = path.join(repoRoot, target);
  if (
    execution.auth.some((auth) => auth.kind === 'oauth-with-token-fallback')
  ) {
    const sharedHelper = path.join(absoluteTarget, 'scripts', 'glean-auth.mjs');
    if (
      !fs.existsSync(sharedHelper) &&
      !hasRecipeOwnedOAuth(repoRoot, target)
    ) {
      errors.push(
        `${recipe.id} ${location}: scaffold does not ship an OAuth login entry point`,
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
  const recipe = readJsonc(file);
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
    const skillText = fs.readFileSync(skill, 'utf8');
    const words = skillText.trim().split(/\s+/u).length;
    if (words > 650)
      errors.push(`${recipe.id}: generated skill is ${words} words (max 650)`);
    const contracts = [
      ...(recipe.execution
        ? [{ execution: recipe.execution, steps: recipe.steps ?? [] }]
        : []),
      ...(recipe.codeAssets ?? [])
        .filter((asset) => asset.execution)
        .map((asset) => ({
          execution: asset.execution,
          steps: asset.steps ?? [],
        })),
    ];
    const expectedPartials = new Set(
      contracts
        .map(({ execution }) => runHandoffPartial(execution))
        .filter(Boolean),
    );
    if (
      contracts.some(({ steps }) =>
        steps.some((step) => step.kind === 'verify-fixture'),
      )
    ) {
      expectedPartials.add('demo-mode');
    }
    for (const partial of expectedPartials) {
      checkPartialReference(skillText, partial, recipe.id);
    }
  }
}

for (const skill of fg.sync('*/SKILL.md', {
  cwd: skillsRoot,
  absolute: true,
})) {
  const source = fs.readFileSync(skill, 'utf8');
  for (const match of source.matchAll(/\{\{>\s*([a-z0-9-]+)\s*\}\}/gu)) {
    const partial = match[1];
    if (!fs.existsSync(path.join(partialsRoot, `${partial}.md`))) {
      errors.push(
        `${path.relative(repoRoot, skill)} references missing partial ${partial}.md`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(
    `Recipe execution contract failures:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
  process.exit(1);
}

console.log('Recipe execution contracts are complete and customer-runnable.');
