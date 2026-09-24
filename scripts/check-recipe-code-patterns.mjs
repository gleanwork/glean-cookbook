#!/usr/bin/env node

import path from 'node:path';

import { recipeCodePatternViolations } from './lib/recipe-code-patterns.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const violations = recipeCodePatternViolations({ repoRoot });

if (violations.length > 0) {
  console.error(
    `Legacy recipe code patterns outside scripts/lib/legacy-recipe-patterns.mjs:\n${violations
      .map((violation) => `- [${violation.rule}] ${violation.message}`)
      .join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    'Recipe code follows the reference pattern outside the legacy allowlist.',
  );
}
