#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourceFile = path.join(repoRoot, 'scripts', 'recipe-auth.mjs');
const targets = [
  'plugin/plugins/cookbook/scripts/glean-auth.mjs',
  'recipes/a2a-client/scripts/glean-auth.mjs',
  'recipes/company-answers/chat-api/scripts/glean-auth.mjs',
  'recipes/company-answers/web-sdk/scripts/glean-auth.mjs',
  'recipes/customer-360/platform-agents/scripts/glean-auth.mjs',
  'recipes/customer-360/platform-search-chat/scripts/glean-auth.mjs',
  'recipes/oncall-copilot/scripts/glean-auth.mjs',
  'recipes/multi-step-agent/invoke-agent/scripts/glean-auth.mjs',
  'recipes/onboarding-hub/platform-chat/scripts/glean-auth.mjs',
  'recipes/onboarding-hub/web-sdk/scripts/glean-auth.mjs',
  'recipes/permissions-aware-retrieval/python/scripts/glean-auth.mjs',
  'recipes/permissions-aware-retrieval/typescript/scripts/glean-auth.mjs',
  'recipes/rfp-responder/scripts/glean-auth.mjs',
];

const expected = fs.readFileSync(sourceFile, 'utf8');
const check = process.argv.includes('--check');
const stale = [];

for (const relativeTarget of targets) {
  const target = path.join(repoRoot, relativeTarget);
  const actual = fs.existsSync(target)
    ? fs.readFileSync(target, 'utf8')
    : undefined;
  if (actual === expected) continue;
  stale.push(relativeTarget);
  if (!check) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, expected, { mode: 0o755 });
  }
}

if (check && stale.length > 0) {
  console.error(
    `Recipe auth runtime is stale:\n${stale.map((file) => `  ${file}`).join('\n')}`,
  );
  console.error('Run npm run auth:sync.');
  process.exit(1);
}

if (!check)
  console.log(`Synced recipe auth runtime to ${targets.length} scaffolds.`);
