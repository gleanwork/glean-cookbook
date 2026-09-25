#!/usr/bin/env node

import path from 'node:path';
import { parseArgs } from 'node:util';

import { createRecipeScaffold } from './lib/recipe-scaffold.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

function usage() {
  return `Usage:
  pnpm create:recipe -- --from <recipe.json> [--dry-run]

The input must be a complete, schema-valid hidden recipe with one Python or
TypeScript code asset and a recipe-level CLI execution contract. The command
creates only the package shell and framework-owned infrastructure; it does not
invent recipe-specific behavior.

TypeScript scaffolds get Vitest, MSW, ESLint, and tsc. An OAuth draft
(oauth-with-token-fallback) must declare scopes, credentialVariable
GLEAN_API_TOKEN, and setupCommand \`npm run login -- --email "<work-email>"\`;
it gets a \`login\` script running \`glean-auth login\` from pinned
@gleanwork/auth, src/client.ts using createGleanTokenProvider, and an MSW
client test. Python scaffolds support token-only auth. See "Start a CLI
recipe" and "Reference recipes" in CONTRIBUTING.md.
`;
}

const argv = process.argv.slice(2);
if (argv[0] === '--') argv.shift();

let values;
try {
  ({ values } = parseArgs({
    args: argv,
    options: {
      from: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`\n${usage()}`);
  process.exit(1);
}

if (values.help) {
  console.log(usage());
  process.exit(0);
}
if (!values.from) {
  console.error('--from is required.\n');
  console.error(usage());
  process.exit(1);
}

try {
  const plan = await createRecipeScaffold({
    repoRoot,
    draftFile: values.from,
    dryRun: values['dry-run'],
  });
  console.log(
    `${values['dry-run'] ? 'Would create' : 'Created'} ${plan.relativeDirectory}:`,
  );
  for (const file of plan.files) console.log(`  ${file.path}`);
  for (const target of plan.generatedTargets) {
    console.log(`  ${target} (framework-generated)`);
  }
  console.log(
    `  ${plan.language === 'typescript' ? 'package-lock.json' : 'main.py.lock'} (lock)`,
  );
  if (!values['dry-run']) {
    console.log(
      '\nNext: replace the scaffold TODO with the recipe-specific workflow, following the reference recipes in CONTRIBUTING.md (validate-and-publish-skill, search-with-discovered-filters). Add its tests, then run the repository checks.',
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
