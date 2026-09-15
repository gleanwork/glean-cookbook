#!/usr/bin/env node

import path from 'node:path';

import { verifyRecipeFixture } from './lib/recipe-regression.mjs';

const recipeId = process.argv.slice(2).find((argument) => argument !== '--');
if (!recipeId) {
  console.error('Usage: pnpm verify:regression -- <recipe-id>');
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, '..');
let report;
try {
  report = await verifyRecipeFixture({ recipeId, repoRoot });
  console.log(`recipe: ${report.recipeId}`);
  console.log(`source: ${report.sourceDigest}`);
  console.log(`fixture commands: ${report.commands.length}`);
  console.log(`behavior: ${report.behavior.status}`);
  if (report.behavior.requests) {
    console.log(`fixture requests: ${report.behavior.requests.length}`);
  }
  console.log(`status: ${report.status}`);
  if (report.status === 'failed') {
    if (report.stderr) console.error(report.stderr);
    if (report.behavior.stderr) console.error(report.behavior.stderr);
  }
  process.exitCode =
    report.status === 'passed' ? 0 : report.status === 'partial' ? 2 : 1;
} finally {
  await report?.cleanup();
}
