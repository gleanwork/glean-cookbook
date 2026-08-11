#!/usr/bin/env node

import path from 'node:path';

import definitions from './artifacts.config.mjs';
import { compileArtifacts, materializeArtifacts } from './lib/artifacts.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const plan = await compileArtifacts(definitions, { repoRoot });
const changes = await materializeArtifacts(plan, { check });

if (check && changes.length > 0) {
  console.error('Generated cookbook artifacts are stale:');
  for (const output of changes) {
    console.error(
      `  ${path.relative(repoRoot, output.file)} (${output.group})`,
    );
  }
  console.error('Run `npm run build:artifacts` and commit the result.');
  process.exit(1);
}

if (check) {
  console.log(`${plan.length} generated cookbook artifacts are up to date.`);
} else {
  console.log(
    changes.length === 0
      ? `${plan.length} generated cookbook artifacts already up to date.`
      : `Wrote ${changes.length} of ${plan.length} generated cookbook artifacts.`,
  );
}
