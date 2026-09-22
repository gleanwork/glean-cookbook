#!/usr/bin/env node

import path from 'node:path';

import { scaffoldReadinessErrors } from './lib/recipe-scaffold.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const errors = await scaffoldReadinessErrors({ repoRoot });

if (errors.length > 0) {
  console.error(
    `Visible recipe scaffold failures:\n${errors.map((error) => `- ${error}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log('Visible recipes contain no unfinished scaffold placeholders.');
}
