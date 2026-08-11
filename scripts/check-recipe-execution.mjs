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
const partialsRoot = path.join(repoRoot, 'plugin', 'partials');
const errors = [];

function runHandoffPartial(execution) {
  if (execution.type === 'local-web') {
    return execution.auth.some((auth) => auth.kind === 'browser-cookie')
      ? 'run-local-web-cookie'
      : 'run-local-web';
  }
  return {
    'existing-app': 'run-existing-app',
    cli: 'run-cli',
    'host-configuration': 'run-host-configuration',
    'hybrid-service': 'run-hybrid-service',
  }[execution.type];
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

  if (execution.type === 'local-web') {
    if (
      !execution.run?.command ||
      !execution.run?.url ||
      execution.run.userBrowser !== true ||
      !runStep
    ) {
      errors.push(
        `${recipe.id} ${location}: local-web requires a run step, persistent command, URL, and user-browser handoff`,
      );
    }
  } else if (execution.type === 'existing-app') {
    if (
      execution.run?.kind !== 'existing-app' ||
      execution.run.userBrowser !== true
    ) {
      errors.push(
        `${recipe.id} ${location}: existing-app requires an existing-app user-browser handoff`,
      );
    }
  } else if (execution.type === 'cli') {
    if (
      !execution.run?.command ||
      execution.run.userBrowser !== false ||
      !runStep
    ) {
      errors.push(
        `${recipe.id} ${location}: cli requires a run step and non-browser run command`,
      );
    }
  } else if (execution.type === 'host-configuration') {
    if (!steps.some((step) => step.kind === 'configure') || !runStep) {
      errors.push(
        `${recipe.id} ${location}: host-configuration requires configure and host restart/reload steps`,
      );
    }
  } else if (execution.type === 'external-builder') {
    if (recipe.buildMethod !== 'third-party-build' || execution.run) {
      errors.push(
        `${recipe.id} ${location}: external-builder must use third-party-build without a local run contract`,
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
  } else {
    errors.push(`${recipe.id} ${location}: unknown execution type`);
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
    if (auth.kind === 'browser-cookie' && execution.run?.userBrowser !== true) {
      errors.push(
        `${recipe.id} ${location}: browser-cookie auth must hand off to the user's browser`,
      );
    }
  }

  if (
    execution.run?.userBrowser === true &&
    execution.run.kind !== 'existing-app' &&
    !execution.run.url
  ) {
    errors.push(
      `${recipe.id} ${location}: user-browser run must declare the URL to hand off`,
    );
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
    if (!execution.run?.command || !execution.run?.url) {
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
      if (
        scripts.demo !== 'node --import tsx scripts/demo.mjs' ||
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

if (errors.length > 0) {
  console.error(
    `Recipe execution contract failures:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
  process.exit(1);
}

console.log('Recipe execution contracts are complete and customer-runnable.');
